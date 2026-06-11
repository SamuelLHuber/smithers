import { describe, expect, test } from "bun:test";

const LIVE = process.env.SMITHERS_REAL_PLUE_ASSUMPTIONS === "1";
const PLUE_BASE = process.env.PLUE_API_BASE_URL ?? "http://127.0.0.1:4000";

// Public dev token seeded by Plue compose in $PLUE_DIR/db/seed.sql.
const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const liveTest = LIVE ? test : test.skip;

describe("real Plue sign-in assumptions", () => {
  liveTest("seeded dev token resolves alice through GET /api/user", async () => {
    const res = await fetch(`${PLUE_BASE}/api/user`, {
      headers: { authorization: `Bearer ${SEEDED_PLUE_TOKEN}` },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      id?: unknown;
      username?: unknown;
      display_name?: unknown;
      email?: unknown;
      is_admin?: unknown;
    };

    expect(body).toMatchObject({
      id: 1,
      username: "alice",
      display_name: "Alice Dev",
      email: "alice@localhost",
      is_admin: true,
    });
  });

  liveTest("anonymous GET /api/user is rejected", async () => {
    const res = await fetch(`${PLUE_BASE}/api/user`);
    expect(res.status).toBe(401);
  });
});
