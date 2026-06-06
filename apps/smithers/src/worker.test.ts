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

function startFixtureServer(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch,
  });
  return {
    origin: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
}

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

describe("worker auth and gateway proxy", () => {
  test("proxies /api/user to the configured Plue auth API", async () => {
    let seenCookie = "";
    const auth = startFixtureServer((request) => {
      const url = new URL(request.url);
      if (url.pathname !== "/api/user") return new Response("missing", { status: 404 });
      seenCookie = request.headers.get("cookie") ?? "";
      return new Response(JSON.stringify({ id: 7, username: "will", is_admin: false }), {
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/api/user`, {
          headers: { cookie: "smithers_session=ok" },
        }),
        { ...keyEnv, AUTH_API_BASE_URL: auth.origin },
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: 7, username: "will" });
      expect(seenCookie).toContain("smithers_session=ok");
    } finally {
      auth.stop();
    }
  });

  test("rewrites proxied OAuth authorize redirect_uri back to the Smithers origin", async () => {
    const auth = startFixtureServer(() => {
      const location = new URL("https://workos.example/user_management/authorize");
      location.searchParams.set("client_id", "client_123");
      location.searchParams.set(
        "redirect_uri",
        "https://api.plue.example/api/auth/workos/callback",
      );
      location.searchParams.set("state", "state_123");
      return new Response(null, {
        status: 302,
        headers: {
          location: location.toString(),
          "set-cookie": "smithers_oauth_state=verifier; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      });
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/api/auth/workos/authorize?provider=GitHubOAuth`, {
          redirect: "manual",
        }),
        { ...keyEnv, AUTH_API_BASE_URL: auth.origin },
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${ORIGIN}/api/auth/workos/callback`,
      );
      expect(res.headers.get("set-cookie")).toContain("smithers_oauth_state=");
    } finally {
      auth.stop();
    }
  });

  test("proxies /api/repos to GO_API_BASE_URL, forwarding credentials, path, and query", async () => {
    let seenPath = "";
    let seenQuery = "";
    let seenCookie = "";
    const platform = startFixtureServer((request) => {
      const url = new URL(request.url);
      seenPath = url.pathname;
      seenQuery = url.search;
      seenCookie = request.headers.get("cookie") ?? "";
      return new Response(JSON.stringify([{ full_name: "acme/widgets" }]), {
        headers: { "content-type": "application/json" },
      });
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/api/repos/acme/widgets/landing-requests?state=open`, {
          headers: { cookie: "smithers_session=ok" },
        }),
        { ...keyEnv, GO_API_BASE_URL: platform.origin },
      );
      expect(res.status).toBe(200);
      expect(seenPath).toBe("/api/repos/acme/widgets/landing-requests");
      expect(seenQuery).toBe("?state=open");
      expect(seenCookie).toContain("smithers_session=ok");
    } finally {
      platform.stop();
    }
  });

  test("platform routes fall back to AUTH_API_BASE_URL when GO_API_BASE_URL is unset", async () => {
    let seenPath = "";
    const auth = startFixtureServer((request) => {
      seenPath = new URL(request.url).pathname;
      return new Response("[]", { headers: { "content-type": "application/json" } });
    });

    try {
      const res = await worker.fetch(new Request(`${ORIGIN}/api/orgs/acme/teams`), {
        ...keyEnv,
        AUTH_API_BASE_URL: auth.origin,
      });
      expect(res.status).toBe(200);
      expect(seenPath).toBe("/api/orgs/acme/teams");
    } finally {
      auth.stop();
    }
  });

  test("platform route with no API base configured → 404", async () => {
    const res = await worker.fetch(new Request(`${ORIGIN}/api/search/code?q=foo`), keyEnv);
    expect(res.status).toBe(404);
  });

  test("validates a Plue session before minting trusted gateway headers", async () => {
    let authSeenAuthorization = "";
    const auth = startFixtureServer((request) => {
      const cookie = request.headers.get("cookie") ?? "";
      authSeenAuthorization = request.headers.get("authorization") ?? "";
      if (!cookie.includes("smithers_session=ok")) {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(JSON.stringify({ id: 7, username: "will", is_admin: true }), {
        headers: { "content-type": "application/json" },
      });
    });
    const gateway = startFixtureServer((request) => {
      return new Response(
        JSON.stringify({
          userId: request.headers.get("x-user-id"),
          role: request.headers.get("x-user-role"),
          scopes: request.headers.get("x-user-scopes"),
          tokenId: request.headers.get("x-smithers-token-id"),
          authorization: request.headers.get("authorization"),
          smithersKey: request.headers.get("x-smithers-key"),
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/v1/rpc/listRuns`, {
          method: "POST",
          headers: {
            cookie: "smithers_session=ok",
            authorization: "Bearer plue-token",
            "x-smithers-key": "browser-gateway-token",
            "x-user-id": "spoofed",
          },
          body: "{}",
        }),
        {
          ...keyEnv,
          AUTH_API_BASE_URL: auth.origin,
          GATEWAY_BASE_URL: gateway.origin,
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("7");
      expect(body.role).toBe("admin");
      expect(body.scopes).toContain("run:admin");
      expect(body.tokenId).toBe("plue:7");
      expect(body.authorization).toBe(null);
      expect(body.smithersKey).toBe(null);
      expect(authSeenAuthorization).toBe("Bearer plue-token");
    } finally {
      gateway.stop();
      auth.stop();
    }
  });

  test("returns a v1 RPC auth frame when Plue session validation fails", async () => {
    let gatewayHits = 0;
    const auth = startFixtureServer(() => new Response("unauthorized", { status: 401 }));
    const gateway = startFixtureServer(() => {
      gatewayHits += 1;
      return new Response("should not be reached");
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/v1/rpc/listRuns`, { method: "POST", body: "{}" }),
        {
          ...keyEnv,
          AUTH_API_BASE_URL: auth.origin,
          GATEWAY_BASE_URL: gateway.origin,
        },
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        type: "res",
        ok: false,
        error: { code: "UNAUTHORIZED" },
      });
      expect(gatewayHits).toBe(0);
    } finally {
      gateway.stop();
      auth.stop();
    }
  });

  test("fails closed when a gateway is configured without Plue auth or a worker gateway token", async () => {
    let gatewayHits = 0;
    const gateway = startFixtureServer(() => {
      gatewayHits += 1;
      return new Response("should not be reached");
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/v1/rpc/listRuns`, {
          method: "POST",
          headers: {
            authorization: "Bearer junk",
            "x-smithers-key": "junk",
          },
          body: "{}",
        }),
        {
          ...keyEnv,
          GATEWAY_BASE_URL: gateway.origin,
        },
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({
        type: "res",
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Gateway authentication service is not configured",
        },
      });
      expect(gatewayHits).toBe(0);
    } finally {
      gateway.stop();
    }
  });

  test("passes worker gateway tokens without trusting browser credential or identity headers", async () => {
    let authHits = 0;
    const auth = startFixtureServer(() => {
      authHits += 1;
      return new Response("unexpected", { status: 500 });
    });
    const gateway = startFixtureServer((request) => {
      return new Response(
        JSON.stringify({
          authorization: request.headers.get("authorization"),
          smithersKey: request.headers.get("x-smithers-key"),
          userId: request.headers.get("x-user-id"),
        }),
        { headers: { "content-type": "application/json" } },
      );
    });

    try {
      const res = await worker.fetch(
        new Request(`${ORIGIN}/v1/rpc/listRuns`, {
          method: "POST",
          headers: {
            authorization: "Bearer browser-plue-token",
            "x-smithers-key": "browser-gateway-token",
            "x-user-id": "spoofed",
          },
          body: "{}",
        }),
        {
          ...keyEnv,
          AUTH_API_BASE_URL: auth.origin,
          GATEWAY_BASE_URL: gateway.origin,
          GATEWAY_AUTH_TOKEN: "gateway-token",
        },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authorization).toBe("Bearer gateway-token");
      expect(body.smithersKey).toBe(null);
      expect(body.userId).toBe(null);
      expect(authHits).toBe(0);
    } finally {
      gateway.stop();
      auth.stop();
    }
  });

  test("can require auth before /api/chat reaches the model gateway", async () => {
    const auth = startFixtureServer(() => new Response("unauthorized", { status: 401 }));
    try {
      const res = await worker.fetch(chatRequest({ messages: [] }), {
        ...keyEnv,
        AUTH_API_BASE_URL: auth.origin,
      });
      expect(res.status).toBe(401);
    } finally {
      auth.stop();
    }
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
