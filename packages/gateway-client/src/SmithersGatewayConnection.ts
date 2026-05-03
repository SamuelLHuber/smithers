import type { GatewayRpcMethod } from "@smithers-orchestrator/gateway/rpc";
import { GatewayRpcError } from "./GatewayRpcError.ts";
import type { GatewayEventFrame } from "./GatewayEventFrame.ts";
import type { GatewayResponseFrame } from "./GatewayResponseFrame.ts";
import type { GatewayRpcParams, GatewayRpcPayload } from "./GatewayRpcTypeMap.ts";

type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  method: string;
};

type QueuedEvent =
  | { kind: "event"; frame: GatewayEventFrame }
  | { kind: "error"; error: Error }
  | { kind: "close" };

function randomId(method: string) {
  const cryptoApi = globalThis.crypto;
  const suffix = typeof cryptoApi?.randomUUID === "function"
    ? cryptoApi.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${method}-${suffix}`;
}

function frameError(frame: Extract<GatewayResponseFrame, { ok: false }>, method: string) {
  return new GatewayRpcError({
    method,
    code: frame.error.code,
    message: frame.error.message,
    requiredScope: frame.error.requiredScope,
    refresh: frame.error.refresh,
    details: frame.error.details,
  });
}

export class SmithersGatewayConnection {
  readonly ws: WebSocket;
  readonly pending = new Map<string, PendingRequest>();
  readonly queue: QueuedEvent[] = [];
  readonly waiters: Array<() => void> = [];
  closed = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (message) => {
      this.handleMessage(message.data);
    });
    ws.addEventListener("error", () => {
      this.push({ kind: "error", error: new Error("Gateway WebSocket error") });
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Gateway WebSocket closed"));
      }
      this.pending.clear();
      this.push({ kind: "close" });
    });
  }

  request<Method extends GatewayRpcMethod>(
    method: Method,
    params: GatewayRpcParams<Method>,
  ): Promise<GatewayRpcPayload<Method>> {
    const id = randomId(method);
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (payload) => resolve(payload as GatewayRpcPayload<Method>),
        reject,
      });
      this.ws.send(JSON.stringify(frame));
    });
  }

  requestRaw(method: string, params?: unknown): Promise<unknown> {
    const id = randomId(method);
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.ws.send(JSON.stringify(frame));
    });
  }

  async *events(signal?: AbortSignal): AsyncGenerator<GatewayEventFrame> {
    const abort = () => this.close();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      while (!this.closed || this.queue.length > 0) {
        const next = await this.shift();
        if (!next || next.kind === "close") {
          return;
        }
        if (next.kind === "error") {
          throw next.error;
        }
        yield next.frame;
      }
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.ws.close();
  }

  private handleMessage(raw: unknown) {
    const text = typeof raw === "string" ? raw : String(raw);
    const frame = JSON.parse(text) as GatewayResponseFrame | GatewayEventFrame;
    if (frame.type === "res") {
      const pending = this.pending.get(frame.id);
      if (!pending) {
        return;
      }
      this.pending.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload);
        return;
      }
      pending.reject(frameError(frame, pending.method));
      return;
    }
    if (frame.type === "event") {
      this.push({ kind: "event", frame });
    }
  }

  private push(event: QueuedEvent) {
    this.queue.push(event);
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }

  private async shift(): Promise<QueuedEvent | undefined> {
    while (this.queue.length === 0) {
      if (this.closed) {
        return { kind: "close" };
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    }
    return this.queue.shift();
  }
}
