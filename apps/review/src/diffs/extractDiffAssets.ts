export type DiffAssets = {
  sprite: string;
  styles: string[];
  body: string;
};

/**
 * Split a prerendered @pierre/diffs HTML block into its shared assets and the
 * per-diff body. Every block ships the same SVG sprite sheet and component
 * stylesheets, so a page embedding many diffs should keep one copy of the
 * assets and concatenate only the bodies.
 */
export function extractDiffAssets(prerenderedHTML: string): DiffAssets {
  const firstStyle = prerenderedHTML.indexOf("<style");
  if (firstStyle < 0) return { sprite: "", styles: [], body: prerenderedHTML };
  const sprite = prerenderedHTML.slice(0, firstStyle);
  const styles: string[] = [];
  let rest = prerenderedHTML.slice(firstStyle);
  while (rest.startsWith("<style")) {
    const end = rest.indexOf("</style>");
    if (end < 0) break;
    styles.push(rest.slice(0, end + "</style>".length));
    rest = rest.slice(end + "</style>".length);
  }
  return { sprite, styles, body: rest };
}
