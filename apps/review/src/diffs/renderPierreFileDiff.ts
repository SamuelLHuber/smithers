import { preloadPatchDiff } from "@pierre/diffs/ssr";

/**
 * Render one file's git patch to Pierre-quality static HTML: syntax
 * highlighting (light/dark token variables), word-level diffs, line numbers,
 * unified or split view. The result is self-contained (inline styles + SVG
 * sprite); use extractDiffAssets to hoist the shared assets when embedding
 * many diffs in one page.
 */
export async function renderPierreFileDiff(args: {
  diff: string;
  diffStyle?: "unified" | "split";
  themeType?: "light" | "dark" | "system";
}): Promise<string> {
  const result = await preloadPatchDiff({
    patch: args.diff.endsWith("\n") ? args.diff : `${args.diff}\n`,
    options: {
      diffStyle: args.diffStyle ?? "unified",
      themeType: args.themeType ?? "light",
      disableFileHeader: true,
    },
  });
  return result.prerenderedHTML;
}
