export type TaskState =
  | "pending"
  | "waiting-approval"
  | "waiting-event"
  | "waiting-timer"
  | "waiting-quota"
  | "in-progress"
  | "finished"
  | "failed"
  | "cancelled"
  | "skipped";
