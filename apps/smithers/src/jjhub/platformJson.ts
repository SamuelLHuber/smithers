import { platformFetch } from "./platformFetch";

/**
 * A failed jjhub request. `status` is the HTTP code; `code` is the machine
 * string from the error body, defaulting to the status when absent. Thrown by
 * `platformJson`. Colocated with the function that throws it.
 */
export class PlatformError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PlatformError";
    this.status = status;
    this.code = code;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Build a PlatformError from a parsed jjhub error body, tolerating the few
 *  shapes the API uses (`{error:{code,message}}`, `{error,message}`, `{message}`). */
function errorFrom(status: number, body: unknown): PlatformError {
  const error = (body as { error?: unknown } | null)?.error;
  if (error && typeof error === "object") {
    const code = String((error as { code?: unknown }).code ?? status);
    const message = String(
      (error as { message?: unknown }).message ?? `jjhub request failed (${status})`,
    );
    return new PlatformError(status, code, message);
  }
  const message =
    typeof error === "string"
      ? error
      : String((body as { message?: unknown } | null)?.message ?? `jjhub request failed (${status})`);
  return new PlatformError(status, String(status), message);
}

/**
 * Fetch jjhub JSON: parse the body, return it on 2xx, throw `PlatformError`
 * otherwise. The thin typed layer over `platformFetch` for endpoints that return
 * a JSON document. For paginated lists, call `platformFetch` directly and read
 * the `Link` header with `parseLinkCursor`.
 */
export async function platformJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await platformFetch(path, init);
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) {
    throw errorFrom(response.status, body);
  }
  return body as T;
}
