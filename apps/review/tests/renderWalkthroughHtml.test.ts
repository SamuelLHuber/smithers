import { describe, expect, test } from "bun:test";
import type { ChangedFile } from "../src/walkthrough/changedFileSchema";
import { renderWalkthroughHtml } from "../src/walkthrough/renderWalkthroughHtml";

const diff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " const keep = 1;",
  "-const removed = 2;",
  "+const added = 2;",
  "+const more = 3;",
].join("\n");

const files: ChangedFile[] = [
  { path: "src/a.ts", status: "modified", insertions: 2, deletions: 1, diff, reviewed: true, excludeReason: "" },
  { path: "src/a.test.ts", status: "added", insertions: 4, deletions: 0, diff: "", reviewed: false, excludeReason: "default_path" },
];

const story = {
  headline: "Replaces removed with added <script>",
  synopsis: "A tiny arc.",
  chapters: [
    { title: "The change & its test", narrative: "Read me first.", files: [
      { path: "src/a.ts", role: "the actual change" },
      { path: "src/a.test.ts", role: "proves it" },
    ] },
  ],
};

const comments = [
  {
    path: "src/a.ts",
    content: "Possible bug: <b>unescaped</b> & dangerous",
    suggestionCode: "const added = safe();",
    existingCode: "const added = 2;",
    startLine: 2,
    endLine: 2,
    thinking: "",
  },
];

function render() {
  return renderWalkthroughHtml({
    title: "",
    story,
    files,
    comments,
    repoDir: "/tmp/repo",
    mode: "workspace",
    ref: "workspace",
    generatedAt: "2026-06-10T00:00:00.000Z",
  });
}

describe("renderWalkthroughHtml", () => {
  test("escapes all dynamic content", () => {
    const html = render();
    expect(html).toContain("Replaces removed with added &lt;script&gt;");
    expect(html).toContain("Possible bug: &lt;b&gt;unescaped&lt;/b&gt; &amp; dangerous");
    expect(html).not.toContain("<b>unescaped</b>");
  });

  test("renders chapters in order with every file and its findings", () => {
    const html = render();
    expect(html).toContain("The change &amp; its test");
    expect(html.indexOf("src/a.ts")).toBeLessThan(html.indexOf("src/a.test.ts"));
    expect(html).toContain("the actual change");
    expect(html).toContain("const added = safe();");
    expect(html).toContain("Review findings (1)");
    expect(html).toContain("not agent-reviewed (default_path)");
  });

  test("renders the diff with add/del rows and is a complete document", () => {
    const html = render();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain('<tr class="add">');
    expect(html).toContain('<tr class="del">');
    expect(html).toContain("@@ −1 +1 @@");
  });

  test("handles an empty change set", () => {
    const html = renderWalkthroughHtml({
      title: "Nothing",
      story: { headline: "", synopsis: "No changes detected.", chapters: [] },
      files: [],
      comments: [],
      repoDir: "/tmp/repo",
      mode: "workspace",
      ref: "workspace",
      generatedAt: "2026-06-10T00:00:00.000Z",
    });
    expect(html).toContain("No changes detected");
  });
});
