export type RunState =
  | "running"
  | "waiting-approval"
  | "waiting-event"
  | "waiting-timer"
  | "waiting-quota"
  | "recovering"
  | "stale"
  | "orphaned"
  | "failed"
  | "cancelled"
  | "succeeded"
  | "unknown";
