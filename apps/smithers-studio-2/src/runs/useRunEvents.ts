import { useEffect, useState } from "react";
import type { RunEventLine } from "./runState";

const MAX_LINES = 500;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Subscribe to a run's live event stream over the Gateway WebSocket.
 *
 * The Gateway streams events at `{ws-origin}/?subscribe=<runId>` framed as
 * `{ event: "run.event", payload: { seq, nodeId, message } }`. Streaming is
 * strictly best-effort: when no socket opens (no live gateway, or a test that
 * does not mock the WS) the hook yields an empty list and never throws, so the
 * surface degrades to a static tree + inspector. Lines feed both the logs tab
 * and the running-cursor last-log per node.
 */
export function useRunEvents(runId: string | undefined): {
  lines: RunEventLine[];
  lastLogByNode: Map<string, string>;
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
    if (!runId || typeof WebSocket === "undefined" || typeof location === "undefined") {
      setStreaming(false);
      return;
    }

    let socket: WebSocket | undefined;
    try {
      const wsOrigin = location.origin.replace(/^http/, "ws");
      socket = new WebSocket(`${wsOrigin}/?subscribe=${encodeURIComponent(runId)}`);
    } catch {
      setStreaming(false);
      return;
    }

    const ingest = (raw: string) => {
      let frame: unknown;
      try {
        frame = JSON.parse(raw);
      } catch {
        return;
      }
      const record = asRecord(frame);
      if (record.event !== "run.event") return;
      const payload = asRecord(record.payload);
      const inner = asRecord(payload.payload);
      const nodeId = typeof inner.nodeId === "string" ? inner.nodeId : undefined;
      const message =
        typeof inner.message === "string"
          ? inner.message
          : typeof inner.text === "string"
            ? inner.text
            : String(payload.event ?? "");
      const line: RunEventLine = {
        seq: typeof payload.seq === "number" ? payload.seq : 0,
        nodeId,
        event: String(payload.event ?? "event"),
        message,
        atMs: Date.now(),
      };
      if (nodeId && message) {
        // Replace the map with a fresh instance so React sees a new reference
        // and the tree's running-cursor last-log re-renders; mutating the old
        // map in place left consumers reading a stale render.
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
    };

    socket.addEventListener("open", () => setStreaming(true));
    socket.addEventListener("message", (event) => {
      if (typeof event.data === "string") ingest(event.data);
    });
    socket.addEventListener("error", () => setStreaming(false));
    socket.addEventListener("close", () => setStreaming(false));

    return () => {
      setStreaming(false);
      try {
        socket?.close();
      } catch {
        // ignore
      }
    };
  }, [runId]);

  return { lines, lastLogByNode, streaming, eventEpoch };
}
