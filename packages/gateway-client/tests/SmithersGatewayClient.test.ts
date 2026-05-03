import { describe, expect, test } from "bun:test";
import { SmithersGatewayClient } from "../src/index.ts";

describe("SmithersGatewayClient", () => {
  test("calls stable Gateway HTTP RPCs", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new SmithersGatewayClient({
      baseUrl: "http://gateway.test/",
      fetch: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            type: "res",
            id: "http",
            ok: true,
            payload: [{ key: "deploy", hasUi: true, uiPath: "/workflows/deploy" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    await expect(client.listWorkflows({ filter: { hasUi: true } })).resolves.toEqual([
      { key: "deploy", hasUi: true, uiPath: "/workflows/deploy" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://gateway.test/v1/rpc/listWorkflows");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ filter: { hasUi: true } }));
    expect(new Headers(calls[0].init.headers).get("content-type")).toBe("application/json");
  });
});
