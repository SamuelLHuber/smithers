/**
 * A canvas surface: the focused view that slides in beside the chat rail when
 * you open something for study. One at a time. Opened from cards or slashes.
 */
export type Surface =
  | { kind: "inspector"; runId: string }
  | { kind: "diff"; runId: string; diffId: string }
  | { kind: "logs"; runId: string }
  | { kind: "timeline"; runId: string };
