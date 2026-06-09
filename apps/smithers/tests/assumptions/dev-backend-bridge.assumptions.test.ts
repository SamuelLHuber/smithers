import { describe, expect, test } from "bun:test";
import { createFakePlueHandler } from "../fixtures/fakePlueHost";
import { SEED_USER, SEED_USER_TOKEN } from "../fixtures/fakePlueSeed";

/**
 * Assumption-validation tests for ticket dev-backend-bridge.
 *
 * Prove the external dependencies the `dev:full` orchestrator will rely on
 * actually behave the way the dossier claims:
 *
 *   1. Plue api on :4000 answers a health probe at /api/health (NOT
 *      /api/healthz; the existing script probes the wrong path).
 *   2. Plue api on :4000 returns 401 on GET /api/user with no Authorization
 *      header — the proxy fall-through bug we are fixing depends on the real
 *      backend being reachable through vite, and 401 is the green path.
 *   3. The Smithers gateway on 127.0.0.1:7331 answers GET /health with
 *      { ok: true }.
 *   4. A seeded bearer token validates and returns a user — exercised via the
 *      in-repo fake Plue handler (Option A), which is the deterministic seam
 *      shared with the Playwright suite. Real Plue (Option B) has no
 *      documented dev token-mint path in the dossier.
 *
 * Guarded by SMITHERS_DEV_E2E=1 so CI (no Docker, no live Plue, no local
 * gateway) skips instead of failing. The validation command set by the
 * dependency gate sets that flag.
 */

const LIVE = process.env.SMITHERS_DEV_E2E === "1";
const PLUE_BASE = process.env.PLUE_API_BASE_URL ?? "http://127.0.0.1:4000";
const GATEWAY_BASE = process.env.SMITHERS_GATEWAY_BASE_URL ?? "http://127.0.0.1:7331";

const liveTest = LIVE ? test : test.skip;

describe("dev-backend-bridge assumptions", () => {
  liveTest("plue api answers /api/health with 200", async () => {
    const res = await fetch(`${PLUE_BASE}/api/health`);
    expect(res.status).toBe(200);
  });

  liveTest("plue api rejects GET /api/user without a token (401)", async () => {
    const res = await fetch(`${PLUE_BASE}/api/user`);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
  });

  liveTest("smithers gateway answers /health with ok:true", async () => {
    const res = await fetch(`${GATEWAY_BASE}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  test("fake-plue seeded bearer validates and returns the seeded user", async () => {
    const handler = createFakePlueHandler({});
    const req = new Request("http://fake-plue.local/api/user", {
      headers: { authorization: `Bearer ${SEED_USER_TOKEN}` },
    });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SEED_USER);
  });

  test("fake-plue rejects anonymous /api/user with 401", async () => {
    const handler = createFakePlueHandler({});
    const res = await handler(new Request("http://fake-plue.local/api/user"));
    expect(res.status).toBe(401);
  });
});
