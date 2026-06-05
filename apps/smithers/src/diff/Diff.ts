/** A unified diff the agent produced, shown as a card and a review canvas. */
export type DiffLineKind = "context" | "add" | "del";

export type DiffLine = {
  kind: DiffLineKind;
  /** Line number in the new file (omitted for deletions). */
  ln?: number;
  text: string;
};

export type DiffFile = {
  path: string;
  add: number;
  del: number;
  lines: DiffLine[];
};

export type Diff = {
  id: string;
  title: string;
  files: DiffFile[];
  totalAdd: number;
  totalDel: number;
};
