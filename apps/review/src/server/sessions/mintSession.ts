import type { D1Database } from "../d1.ts";
import { randomTokenHex } from "../randomTokenHex.ts";
import { sha256Hex } from "../sha256Hex.ts";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export interface MintedSession {
  token: string;
  hash: string;
  expiresAt: number;
}

/**
 * Issue a session token, record it (hashed) plus an entry in reviewed_prs for
 * this month. Both writes happen in the order that minimizes the bad-state
 * window: counting first then minting means a crash mid-flight charges the
 * quota without a usable session, which the user can retry. The other order
 * would leak inference past the plan.
 */
export async function mintSession(
  db: D1Database,
  repo: string,
  pr: number,
  spendCapUsd: number,
  monthKey: string,
  alreadyReviewed: boolean,
  now: number,
): Promise<MintedSession> {
  if (!alreadyReviewed) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO reviewed_prs (repo, pr, month, first_seen_at) VALUES (?, ?, ?, ?)",
      )
      .bind(repo, pr, monthKey, now)
      .run();
  }
  const token = `srs_${randomTokenHex(32)}`;
  const hash = await sha256Hex(token);
  const expiresAt = now + SESSION_TTL_MS;
  await db
    .prepare(
      "INSERT INTO sessions (hash, repo, pr, expires_at, spend_cap_usd, spent_usd, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
    )
    .bind(hash, repo, pr, expiresAt, spendCapUsd, now)
    .run();
  return { token, hash, expiresAt };
}
