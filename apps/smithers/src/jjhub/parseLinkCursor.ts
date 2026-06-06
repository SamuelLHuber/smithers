/**
 * Parse the `rel="next"` cursor from an RFC 8288 `Link` response header. jjhub
 * paginates list endpoints with `Link: <…?cursor=abc>; rel="next"`; the cursor
 * is the `cursor` query param of that next URL. Returns null when there is no
 * next page. Both relative and absolute next URLs parse.
 */
export function parseLinkCursor(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(/,\s*</)) {
    const raw = part.startsWith("<") ? part : `<${part}`;
    const urlMatch = raw.match(/^<([^>]+)>/);
    const relMatch = raw.match(/rel="([^"]+)"/);
    if (urlMatch && relMatch && relMatch[1] === "next") {
      try {
        return new URL(urlMatch[1], "http://localhost").searchParams.get("cursor");
      } catch {
        return null;
      }
    }
  }
  return null;
}
