import { afterAll, describe, expect, test } from "bun:test";
import worker from "./worker";
import type { CloudflareEnv } from "./env";
import { startCerebrasUpstream } from "../tests/fixtures/cerebrasUpstream";
import { SEEDED_CHAT_REPLY } from "../tests/fixtures/seededChat";

/**
 * REAL gateway test: drive src/worker.ts the way Cloudflare does — call its
 * `fetch(request, env)` directly. The guard cases need no upstream; the happy
 * path boots the REAL OpenAI-compatible fixture upstream and asserts the whole
 * chain (worker → `openai` SDK → upstream SSE → TanStack bridge) reconstructs
 * the seeded reply. No key, no mocks.
 */

const ORIGIN = "http://127.0.0.1:9100";

function chatRequest(body: unknown, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(init.headers ?? {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
  });
}

const keyEnv: CloudflareEnv = { CEREBRAS_API_KEY: "fixture-key" };

/** Parse an SSE body into the AG-UI chunk objects it carried. */
function parseSse(text: string): Array<Record<string, unknown>> {
  const chunks: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(data));
    } catch {
      // skip non-JSON keepalives
    }
  }
  return chunks;
}

describe("worker routing + guards", () => {
  test("non-POST /api/chat → 405", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/chat`, { method: "GET" }), keyEnv);
    expect(res.status).toBe(405);
  });

  test("missing CEREBRAS_API_KEY → 500", async () => {
    const res = await worker.fetch(chatRequest({ messages: [] }), { CEREBRAS_API_KEY: "" });
    expect(res.status).toBe(500);
  });

  test("cross-origin (no Origin header) → 403", async () => {
    const res = await worker.fetch(
      new Request(`${ORIGIN}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [] }),
      }),
      keyEnv,
    );
    expect(res.status).toBe(403);
  });

  test("mismatched Origin → 403", async () => {
    const res = await worker.fetch(
      chatRequest({ messages: [] }, { headers: { origin: "http://evil.example" } }),
      keyEnv,
    );
    expect(res.status).toBe(403);
  });

  test("invalid JSON body → 400", async () => {
    const res = await worker.fetch(chatRequest("not json{"), keyEnv);
    expect(res.status).toBe(400);
  });

  test("non-object body (array) → 400", async () => {
    const res = await worker.fetch(chatRequest([1, 2, 3]), keyEnv);
    expect(res.status).toBe(400);
  });

  test("missing messages[] → 400", async () => {
    const res = await worker.fetch(chatRequest({ system: "hi" }), keyEnv);
    expect(res.status).toBe(400);
  });

  test("too many messages → 413", async () => {
    const messages = Array.from({ length: 101 }, () => ({ role: "user", content: "x" }));
    const res = await worker.fetch(chatRequest({ messages }), keyEnv);
    expect(res.status).toBe(413);
  });

  test("oversized content → 413", async () => {
    const messages = [{ role: "user", content: "x".repeat(100 * 1024 + 1) }];
    const res = await worker.fetch(chatRequest({ messages }), keyEnv);
    expect(res.status).toBe(413);
  });

  test("malformed message entry → 400", async () => {
    const res = await worker.fetch(chatRequest({ messages: [{ role: "system", content: "x" }] }), keyEnv);
    expect(res.status).toBe(400);
  });

  test("non-string system → 400", async () => {
    const res = await worker.fetch(
      chatRequest({ messages: [{ role: "user", content: "hi" }], system: 42 }),
      keyEnv,
    );
    expect(res.status).toBe(400);
  });

  test("unknown path with no ASSETS binding → 404", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/nope`), keyEnv);
    expect(res.status).toBe(404);
  });
});

describe("worker → fixture upstream (keyless gateway)", () => {
  const upstream = startCerebrasUpstream();
  const env: CloudflareEnv = {
    CEREBRAS_API_KEY: "fixture-key",
    CEREBRAS_BASE_URL: `http://127.0.0.1:${upstream.port}/v1`,
  };

  afterAll(() => upstream.stop(true));

  test("streams the seeded reply as SSE TEXT_MESSAGE_CONTENT deltas", async () => {
    const res = await worker.fetch(
      chatRequest({ messages: [{ role: "user", content: "make a plan" }] }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const chunks = parseSse(await res.text());
    expect(chunks.some((c) => c.type === "RUN_ERROR")).toBe(false);

    const text = chunks
      .filter((c) => c.type === "TEXT_MESSAGE_CONTENT" && typeof c.delta === "string")
      .map((c) => c.delta as string)
      .join("");
    expect(text).toBe(SEEDED_CHAT_REPLY);
  }, 20_000);

  test("forwards an optional system prompt without error", async () => {
    const res = await worker.fetch(
      chatRequest({ messages: [{ role: "user", content: "hi" }], system: "Be terse." }),
      env,
    );
    expect(res.status).toBe(200);
    const chunks = parseSse(await res.text());
    expect(chunks.some((c) => c.type === "RUN_ERROR")).toBe(false);
    expect(chunks.some((c) => c.type === "TEXT_MESSAGE_CONTENT")).toBe(true);
  }, 20_000);
});
