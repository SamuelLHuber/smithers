import { describe, expect, test } from "bun:test";
import { createFakePlueHandler } from "../fixtures/fakePlueHost";
import { SEED_USER, SEED_USER_TOKEN } from "../fixtures/fakePlueSeed";

/**
 * Assumption-validation tests for ticket real-signin-e2e.
 *
 * The new Playwright spec will drive the SignInForm token box on the
 * plue-harness app origin (port 5292) and assert the app transitions from
 * signed-out to signed-in by round-tripping through the real same-origin
 * vite proxy into the in-repo fake Plue host (port 5290 with label "auth").
 *
 * That story rests on three real pieces standing up the way the dossier
 * claims:
 *
 *   1. The fake Plue handler used as the auth target validates Bearer
 *      SEED_USER_TOKEN against GET /api/user and returns SEED_USER. Without
 *      this the modal would always flip the store back to signed-out with
 *      "Invalid token.".
 *   2. The same handler rejects anonymous GET /api/user with 401, which is
 *      what authStore.signInWithToken treats as "invalid". The spec's
 *      SIGNED-OUT precondition assertion relies on a clean 401 path.
 *   3. The Playwright webServer stack actually boots the auth fake on
 *      127.0.0.1:5290 AND the plue-harness vite origin on 127.0.0.1:5292,
 *      and 5292 proxies /api/user to the fake (label "auth"). If the proxy
 *      target leaked to the platform fake or the harness origin failed to
 *      come up, the Playwright spec would fail in a way that looks like an
 *      auth bug — these probes pin the infra contract before that lie.
 *
 * The handler-level checks run unconditionally (pure fixture, no network).
 * The live HTTP probes against 5290 / 5292 require the Playwright webServer
 * stack and are guarded by SMITHERS_DEV_E2E=1 so CI skips them. The
 * validation command set by the dependency gate sets that flag and also
 * boots the webServer stack via `playwright test --list` first.
 */

const LIVE = process.env.SMITHERS_DEV_E2E === "1";
const FAKE_PLUE_AUTH_BASE =
  process.env.SMITHERS_FAKE_PLUE_AUTH_BASE_URL ?? "http://127.0.0.1:5290";
const PLUE_HARNESS_BASE =
  process.env.SMITHERS_PLUE_HARNESS_BASE_URL ?? "http://127.0.0.1:5292";

const liveTest = LIVE ? test : test.skip;

describe("real-signin-e2e assumptions", () => {
  test("fake-plue handler validates seeded bearer and returns SEED_USER", async () => {
    const handler = createFakePlueHandler({});
    const res = await handler(
      new Request("http://fake-plue.local/api/user", {
        headers: { authorization: `Bearer ${SEED_USER_TOKEN}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: number; display_name: string };
    expect(body.id).toBe(SEED_USER.id);
    expect(body.display_name).toBe(SEED_USER.display_name);
  });

  test("fake-plue handler rejects anonymous GET /api/user with 401", async () => {
    const handler = createFakePlueHandler({});
    const res = await handler(new Request("http://fake-plue.local/api/user"));
    expect(res.status).toBe(401);
  });

  test("fake-plue handler rejects a non-seed token with 401", async () => {
    const handler = createFakePlueHandler({});
    const res = await handler(
      new Request("http://fake-plue.local/api/user", {
        headers: { authorization: "Bearer not_a_real_token" },
      }),
    );
    expect(res.status).toBe(401);
  });

  liveTest("auth fake-plue is up on :5290 and answers /health", async () => {
    const res = await fetch(`${FAKE_PLUE_AUTH_BASE}/health`);
    expect(res.status).toBe(200);
  });

  liveTest("auth fake-plue on :5290 returns 401 on anonymous /api/user", async () => {
    const res = await fetch(`${FAKE_PLUE_AUTH_BASE}/api/user`);
    expect(res.status).toBe(401);
  });

  liveTest(
    "auth fake-plue on :5290 returns SEED_USER with the seeded bearer",
    async () => {
      const res = await fetch(`${FAKE_PLUE_AUTH_BASE}/api/user`, {
        headers: { authorization: `Bearer ${SEED_USER_TOKEN}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: number; display_name: string };
      expect(body.id).toBe(SEED_USER.id);
      expect(body.display_name).toBe(SEED_USER.display_name);
    },
  );

  liveTest(
    "plue-harness vite origin on :5292 proxies /api/user to the auth fake",
    async () => {
      const anon = await fetch(`${PLUE_HARNESS_BASE}/api/user`);
      expect(anon.status).toBe(401);

      const authed = await fetch(`${PLUE_HARNESS_BASE}/api/user`, {
        headers: { authorization: `Bearer ${SEED_USER_TOKEN}` },
      });
      expect(authed.status).toBe(200);
      const body = (await authed.json()) as { id: number; display_name: string };
      expect(body.id).toBe(SEED_USER.id);
      expect(body.display_name).toBe(SEED_USER.display_name);
    },
  );
});
