import type { D1Database } from "../d1.ts";

export interface QuotaState {
  monthKey: string;
  used: number;
  alreadyReviewed: boolean;
  overQuota: boolean;
}

function monthKeyFor(now: number): string {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/**
 * Counts reviewed_prs for the calendar month and decides whether `pr` can be
 * counted against the plan. Pure read; mintSession() does the insert once we
 * commit to issuing a session.
 */
export async function checkQuota(
  db: D1Database,
  repo: string,
  pr: number,
  prsPerMonth: number,
  now: number,
): Promise<QuotaState> {
  const monthKey = monthKeyFor(now);
  const usedRow = await db
    .prepare("SELECT COUNT(*) as c FROM reviewed_prs WHERE repo = ? AND month = ?")
    .bind(repo, monthKey)
    .first<{ c: number }>();
  const used = usedRow?.c ?? 0;
  const existingRow = await db
    .prepare("SELECT 1 as ok FROM reviewed_prs WHERE repo = ? AND pr = ? AND month = ?")
    .bind(repo, pr, monthKey)
    .first<{ ok: number }>();
  const alreadyReviewed = existingRow != null;
  const overQuota = !alreadyReviewed && used >= prsPerMonth;
  return { monthKey, used, alreadyReviewed, overQuota };
}
