/**
 * Extract a Bearer token from a Request's authorization header. Returns null
 * if the header is missing or malformed. The token is the raw string after
 * "Bearer "; callers decide what to do with it.
 */
export function bearerToken(request: Request): string | null {
  const raw = request.headers.get("authorization") ?? "";
  if (!raw.startsWith("Bearer ")) return null;
  const token = raw.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}
