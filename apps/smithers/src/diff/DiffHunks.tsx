import type { DiffFile } from "./Diff";

const SIGN: Record<string, string> = { context: " ", add: "+", del: "−" };

/** Render a file's unified-diff lines with line numbers and add/del coloring. */
export function DiffHunks({ file }: { file: DiffFile }) {
  return (
    <div className="diff">
      {file.lines.map((line, index) => (
        <div className={`diff-line ${line.kind}`} key={index}>
          <span className="diff-ln">{line.ln ?? ""}</span>
          <span className="diff-sign">{SIGN[line.kind]}</span>
          <span className="diff-text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
