import { escapeHtml } from "./escapeHtml";

const MAX_RENDERED_LINES = 1_500;

const skippedPrefixes = [
  "diff --git ",
  "index ",
  "--- ",
  "+++ ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity index",
  "rename from",
  "rename to",
  "Binary files ",
];

function row(kind: "add" | "del" | "ctx", oldNum: string, newNum: string, text: string): string {
  return `<tr class="${kind}"><td class="ln">${oldNum}</td><td class="ln">${newNum}</td><td class="code">${escapeHtml(text)}</td></tr>`;
}

/** Display-only unified-diff renderer for the walkthrough. */
export function renderDiffHtml(diffText: string): string {
  if (!diffText.trim()) return `<p class="diff-note">No textual diff (binary or empty change).</p>`;
  const rows: string[] = [];
  let oldLine = 0;
  let newLine = 0;
  let rendered = 0;
  let truncatedAt = -1;
  const lines = diffText.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (rendered >= MAX_RENDERED_LINES) {
      truncatedAt = i;
      break;
    }
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push(`<tr class="hunk"><td class="ln"></td><td class="ln"></td><td class="code">@@ −${hunk[1]} +${hunk[2]} @@${escapeHtml(hunk[3])}</td></tr>`);
      rendered += 1;
      continue;
    }
    if (skippedPrefixes.some((prefix) => line.startsWith(prefix))) continue;
    if (line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      rows.push(row("add", "", String(newLine), line.slice(1)));
      newLine += 1;
    } else if (line.startsWith("-")) {
      rows.push(row("del", String(oldLine), "", line.slice(1)));
      oldLine += 1;
    } else {
      if (oldLine === 0 && newLine === 0) continue; // preamble before the first hunk
      rows.push(row("ctx", String(oldLine), String(newLine), line.startsWith(" ") ? line.slice(1) : line));
      oldLine += 1;
      newLine += 1;
    }
    rendered += 1;
  }
  if (truncatedAt >= 0) {
    const remaining = lines.length - truncatedAt;
    rows.push(`<tr class="hunk"><td class="ln"></td><td class="ln"></td><td class="code">… diff truncated (${remaining} more line(s))</td></tr>`);
  }
  return `<table class="diff"><tbody>${rows.join("")}</tbody></table>`;
}
