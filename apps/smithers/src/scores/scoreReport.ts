/** An eval/score report, shown as a compact scorecard. */
export type ScoreTile = { name: string; value: string };

export type ScoreReport = {
  id: string;
  suite: string;
  delta: string;
  tiles: ScoreTile[];
  /** Trend bars, 0..1. */
  trend: number[];
};

export const SCORE_REPORTS: Record<string, ScoreReport> = {
  "review-suite": {
    id: "review-suite",
    suite: "review-suite",
    delta: "+0.06",
    tiles: [
      { name: "evals", value: "24" },
      { name: "mean", value: "0.82" },
      { name: "tokens", value: "1.2M" },
      { name: "p95", value: "8.3s" },
      { name: "cost", value: "$0.74" },
    ],
    trend: [0.4, 0.55, 0.48, 0.7, 0.62, 0.8, 0.74, 0.88],
  },
};

export function findReport(id: string): ScoreReport | undefined {
  return SCORE_REPORTS[id];
}
