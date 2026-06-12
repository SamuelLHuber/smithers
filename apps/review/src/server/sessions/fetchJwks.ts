import { jwksCache } from "./jwksCache.ts";

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface JsonWebKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

/**
 * GitHub Actions OIDC JWKS lookup, cached in-memory for the worker instance.
 * The discovery URL is injected by the worker so tests can point at a
 * Bun.serve fixture instead of token.actions.githubusercontent.com.
 */
export async function fetchJwks(
  url: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<JsonWebKey[]> {
  const cached = jwksCache.get(url);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.keys;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`jwks fetch ${url} returned ${response.status}`);
  }
  const body = (await response.json()) as { keys?: JsonWebKey[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(url, { fetchedAt: now, keys });
  return keys;
}
