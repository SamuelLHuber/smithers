export type RunStatus =
  | "running"
  | "waiting-approval"
  | "waiting-event"
  | "waiting-timer"
  | "waiting-quota"
  | "finished"
  | "continued"
  | "failed"
  | "cancelled";
