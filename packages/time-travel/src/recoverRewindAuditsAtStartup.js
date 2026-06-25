import { recoverInProgressRewindAudits } from "./recoverInProgressRewindAudits.js";

/** @typedef {import("@smithers-orchestrator/db/adapter").SmithersDb} SmithersDb */

/**
 * Best-effort startup recovery of rewinds interrupted by a prior crash. Call
 * once per run-driving process boot (CLI `up`, served runs). It finds audit rows
 * left in `in_progress`, marks them `partial`, and flags the runs as
 * needs_attention — the durable marker `jumpToFrame` writes before mutating is
 * useless unless something runs this on startup.
 *
 * NEVER throws: startup must not be blocked. The non-SQLite case (e.g. a Postgres
 * audit client, which has no recovery path) surfaces as a TypeError from
 * `resolveRewindAuditClient` mentioning the SQLite client; that is swallowed
 * silently. Any other failure is reported via `onError` but still swallowed.
 *
 * @param {SmithersDb} adapter
 * @param {{ onRecovered?: (count: number) => void; onError?: (error: unknown) => void; nowMs?: () => number }} [options]
 * @returns {Promise<void>}
 */
export async function recoverRewindAuditsAtStartup(adapter, options = {}) {
  try {
    const { recovered } = await recoverInProgressRewindAudits(adapter, { nowMs: options.nowMs });
    if (recovered.length > 0) {
      options.onRecovered?.(recovered.length);
    }
  }
  catch (error) {
    const isNonSqliteAuditClient = error instanceof TypeError && /SQLite/.test(error.message);
    if (!isNonSqliteAuditClient) {
      options.onError?.(error);
    }
  }
}
