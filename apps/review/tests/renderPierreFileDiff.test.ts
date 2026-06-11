import { describe, expect, test } from "bun:test";
import { extractDiffAssets } from "../src/diffs/extractDiffAssets";
import { renderPierreFileDiff } from "../src/diffs/renderPierreFileDiff";

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " const keep = 1;",
  "-const removed = 2;",
  "+const added = 2;",
  "+const more = 3;",
].join("\n");

describe("renderPierreFileDiff", () => {
  test("renders highlighted, line-numbered diff HTML", async () => {
    const html = await renderPierreFileDiff({ diff: patch });
    expect(html).toContain("data-dehydrated");
    expect(html).toContain('data-line-type="change-addition"');
    expect(html).toContain('data-line-type="change-deletion"');
    expect(html).toContain("--diffs-token-light");
    expect(html).toContain("data-line-number-content");
  });

  test("split style renders the split layout", async () => {
    const html = await renderPierreFileDiff({ diff: patch, diffStyle: "split" });
    expect(html).toContain('data-diff-type="split"');
  });

  test("extractDiffAssets splits sprite, styles, and body", async () => {
    const html = await renderPierreFileDiff({ diff: patch });
    const assets = extractDiffAssets(html);
    expect(assets.sprite.startsWith("<svg")).toBe(true);
    expect(assets.styles.length).toBeGreaterThanOrEqual(2);
    for (const style of assets.styles) {
      expect(style.startsWith("<style")).toBe(true);
      expect(style.endsWith("</style>")).toBe(true);
    }
    expect(assets.body).toContain("data-dehydrated");
    expect(assets.body).not.toContain("<style");
    expect(assets.sprite + assets.styles.join("") + assets.body).toBe(html);
  });
});
