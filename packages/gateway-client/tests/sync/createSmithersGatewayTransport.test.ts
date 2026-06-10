import { describe, expect, test } from "bun:test";
import type { SmithersGatewayClient } from "../../src/SmithersGatewayClient.ts";
import { createSmithersGatewayTransport } from "../../src/sync/createSmithersGatewayTransport.ts";

describe("createSmithersGatewayTransport", () => {
  test("passes afterSeq through streamDevTools subscriptions", async () => {
    const calls: Array<{ params: unknown; signal: AbortSignal | undefined }> = [];
    const client = {
      rpcRaw() {
        throw new Error("not used");
      },
      async *streamDevTools(params: unknown, options: { signal?: AbortSignal }) {
        calls.push({ params, signal: options.signal });
        yield {
          event: "devtools.event",
          seq: 7,
          payload: { streamId: "stream-1", event: { kind: "snapshot" } },
        };
      },
    } as unknown as SmithersGatewayClient;
    const transport = createSmithersGatewayTransport(client);
    const controller = new AbortController();
    const frames = [];

    for await (const frame of transport.stream?.(
      "streamDevTools",
      { runId: "run-1" },
      { afterSeq: 6, signal: controller.signal },
    ) ?? []) {
      frames.push(frame);
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      params: { runId: "run-1", afterSeq: 6 },
      signal: controller.signal,
    });
    expect(frames).toEqual([
      {
        key: ["gateway:streamDevTools", { runId: "run-1" }],
        event: "devtools.event",
        seq: 7,
        payload: { streamId: "stream-1", event: { kind: "snapshot" } },
      },
    ]);
  });
});
