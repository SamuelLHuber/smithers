/**
 * Base-URL resolution for the jjhub (Plue) REST API, the cloud code-hosting
 * backend the new UI must reach alongside the smithers gateway.
 *
 * Mirrors the gateway base-url helpers in auth/authClient.ts. A configured
 * origin (VITE_SMITHERS_PLATFORM_BASE_URL, overridable in localStorage) is used
 * directly; with none set, paths resolve same-origin so the Cloudflare Worker
 * can proxy them (see docs/jjhub-backend-seam.md). The gateway is run-context
 * (/v1/rpc); this is repo-context (REST). They coexist.
 */
const PLATFORM_BASE_URL_KEY = "smithers_platform_base_url";

function readLocalValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalValue(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
    return true;
  } catch {
    return false;
  }
}

function envString(key: string): string {
  const value = import.meta.env[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Validate and canonicalize a base origin; returns "" for anything unusable. */
export function normalizePlatformBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function getPlatformBaseUrl(): string {
  return normalizePlatformBaseUrl(
    readLocalValue(PLATFORM_BASE_URL_KEY) ?? envString("VITE_SMITHERS_PLATFORM_BASE_URL"),
  );
}

export function setPlatformBaseUrl(value: string): boolean {
  return writeLocalValue(PLATFORM_BASE_URL_KEY, normalizePlatformBaseUrl(value));
}

/**
 * Resolve an API path to a full URL: the configured platform origin, or
 * same-origin (Worker-proxied) when none is set. The same-origin fallback uses
 * a fixed loopback origin outside a browser so the helper is pure in tests.
 */
export function platformUrl(path: string): string {
  const base = getPlatformBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!base) {
    const origin =
      typeof location !== "undefined" && location.origin && location.origin !== "null"
        ? location.origin
        : "http://127.0.0.1:7331";
    return `${origin}${normalizedPath}`;
  }
  return new URL(normalizedPath, base).toString();
}
