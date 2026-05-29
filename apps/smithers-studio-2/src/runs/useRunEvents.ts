import { useEffect, useState } from "react";
import { SmithersGatewayClient } from "@smithers-orchestrator/gateway-client";
import type { RunEventLine } from "./runState";

const MAX_LINES = 500;

/**
 * The Gateway accepts a WebSocket upgrade on any path; its default `wsPath` is
 * `/`, which in dev collides with Vite's HMR socket and in the SPA shell has no
 * boot config to override it. We instead route the run-event socket through the
 * SAME `/v1/rpc` prefix the RPC client already uses — that path is proxied to
 * the real Gateway in dev (and e2e), and is a real Gateway upgrade endpoint in
 * production. This subclass rewrites only the path so the client's connect/
 * subscribe handshake reaches the Gateway instead of Vite.
 */
const RPC_WS_PATH = "/v1/rpc";

class RpcPathWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const next = new URL(url);
    next.pathname = RPC_WS_PATH;
    next.search = "";
    super(next.toString(), protocols);
  }
}

let cachedClient: SmithersGatewayClient | undefined;

/**
 * The Gateway client the live run-event stream rides on. It is the SAME wire
 * protocol the rest of the Runs surface speaks over `/v1/rpc`, but here we need
 * the WebSocket transport (RPC-over-WS `connect` handshake + `streamRunEvents`
 * subscription) so the Gateway actually delivers `run.event` frames. A raw
 * `?subscribe=` socket receives nothing because the Gateway only fans events to
 * streams registered via the `streamRunEvents` RPC after a `connect` frame.
 */
function runEventsClient(): SmithersGatewayClient {
  if (!cachedClient) {
    cachedClient = new SmithersGatewayClient({ WebSocket: RpcPathWebSocket });
  }
  return cachedClient;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Map a real Gateway run-event stream payload onto a {@link RunEventLine}. The
 * stream frame's `payload` is `{ streamId, runId, seq, event, payload }`, where
 * the inner `event` is the run event name (`node.started`, `task.output`, …)
 * and the inner `payload` carries `nodeId` plus event-specific fields (the
 * NodeOutput `output` text is the live log line; some events carry no text).
 */
function toLine(streamPayload: Record<string, unknown>): RunEventLine {
  const inner = asRecord(streamPayload.payload);
  const eventName = typeof streamPayload.event === "string" ? streamPayload.event : "event";
  const nodeId = typeof inner.nodeId === "string" ? inner.nodeId : undefined;
  const message =
    typeof inner.output === "string"
      ? inner.output
      : typeof inner.message === "string"
        ? inner.message
        : typeof inner.text === "string"
          ? inner.text
          : typeof inner.error === "string"
            ? inner.error
            : eventName;
  return {
    seq: typeof streamPayload.seq === "number" ? streamPayload.seq : 0,
    nodeId,
    event: eventName,
    message,
    atMs: Date.now(),
  };
}

/**
 * Subscribe to a run's live event stream over the Gateway WebSocket.
 *
 * This drives the REAL Gateway protocol via {@link SmithersGatewayClient}: it
 * opens the RPC-over-WS transport, sends the `connect` handshake (subscribing
 * to the run), and registers a `streamRunEvents` subscription — the only way
 * the Gateway fans `run.event` frames to a client. Frames map onto the logs
 * tab (`lines`), the per-node running cursor (`lastLogByNode`), and a monotonic
 * `eventEpoch` the data layer watches to debounce a live getRun/snapshot
 * refresh. `streamRunEventsResilient` reconnects + resumes from the last seq on
 * a silent drop, so the stream survives transient socket loss.
 *
 * Streaming is best-effort: when no socket opens (no live Gateway) the hook
 * yields an empty list and never throws, so the surface degrades to a static
 * tree + inspector (polling in useRunsData is the floor).
 */
export function useRunEvents(runId: string | undefined): {
  lines: RunEventLine[];
  lastLogByNode: Map<string, string>;
  /**
   * True only while the Gateway WebSocket is actually connected and the
   * `streamRunEvents` subscription is live — not merely because a non-terminal
   * run is selected. Drops to false when the socket closes or the stream ends.
   */
  streaming: boolean;
  /**
   * Monotonic counter bumped once per ingested `run.event` frame. The data
   * layer watches this to debounce-refresh getRun/getDevToolsSnapshot, so new
   * approvals, state transitions, and completion appear live without the user
   * re-selecting the run. Resets to 0 when the run changes.
   */
  eventEpoch: number;
} {
  const [lines, setLines] = useState<RunEventLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [lastLogByNode, setLastLogByNode] = useState<Map<string, string>>(new Map());
  const [eventEpoch, setEventEpoch] = useState(0);

  useEffect(() => {
    setLastLogByNode(new Map());
    setLines([]);
    setEventEpoch(0);
    setStreaming(false);
    if (!runId || typeof WebSocket === "undefined") {
      return;
    }

    const abort = new AbortController();
    let connected = false;

    void (async () => {
      try {
        for await (const frame of runEventsClient().streamRunEventsResilient(
          { runId },
          { signal: abort.signal },
        )) {
          // The first delivered frame proves the connect handshake +
          // subscription succeeded, so the live badge reflects a real stream.
          if (!connected) {
            connected = true;
            setStreaming(true);
          }
          // Heartbeats keep the stream alive but carry no log line; they still
          // confirm connectivity (handled above) without bumping the epoch.
          if (frame.event === "run.heartbeat") continue;
          const streamPayload = asRecord(frame.payload);
          const line = toLine(streamPayload);
          if (line.nodeId && line.message) {
            // Replace the map with a fresh instance so React sees a new
            // reference and the tree's running-cursor last-log re-renders;
            // mutating in place left consumers reading a stale render.
            const { nodeId, message } = line;
            setLastLogByNode((current) => {
              const next = new Map(current);
              next.set(nodeId, message);
              return next;
            });
          }
          setLines((current) => {
            const next = [...current, line];
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
          setEventEpoch((epoch) => epoch + 1);
        }
      } catch {
        // A real drop/failure (connect refused, invalid frame). Best-effort:
        // fall through to the static + polling surface without throwing.
      } finally {
        if (!abort.signal.aborted) setStreaming(false);
      }
    })();

    return () => {
      setStreaming(false);
      abort.abort();
    };
  }, [runId]);

  return { lines, lastLogByNode, streaming, eventEpoch };
}
