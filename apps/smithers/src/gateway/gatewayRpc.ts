import { gatewayUrl, handleAuthRequired, withAuthHeaders } from "../auth/authClient";

/**
 * A minimal Smithers Gateway RPC client.
 *
 * It speaks the gateway wire protocol over plain `fetch`, so the app pulls in
 * no gateway package and no extra React tree. Dev/e2e can proxy `/v1/rpc`;
 * deployed remote mode can instead set a gateway base URL.
 *
 * Returns the unwrapped `payload`; throws `Error` (with the gateway error code
 * in `.message`) on a non-ok frame or transport failure.
 */

type ResponseFrame =
  | { type?: "res"; ok: true; payload: unknown }
  | {
      type?: "res";
      ok: false;
      error: {
        code: string;
        message: string;
        requiredScope?: string;
        refresh?: string;
      };
    };

function isResponseFrame(value: unknown): value is ResponseFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as { type?: unknown }).type === undefined ||
      (value as { type?: unknown }).type === "res") &&
    typeof (value as { ok?: unknown }).ok === "boolean" &&
    ((value as { ok?: unknown }).ok === true ||
      typeof (value as { error?: { code?: unknown } }).error?.code === "string")
  );
}

function isUnauthorizedFrame(frame: ResponseFrame): boolean {
  return !frame.ok && /^(UNAUTHORIZED|Unauthorized)$/i.test(frame.error.code);
}

export async function gatewayRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch(gatewayUrl(`/v1/rpc/${method}`), {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders({ "content-type": "application/json" }, "POST"),
    body: JSON.stringify(params),
  });
  let frame: unknown;
  try {
    frame = await response.json();
  } catch {
    if (response.status === 401) {
      handleAuthRequired();
    }
    throw new Error(`Gateway HTTP ${response.status}`);
  }
  if (!isResponseFrame(frame)) {
    throw new Error("Gateway returned an invalid RPC frame.");
  }
  if (response.status === 401 || isUnauthorizedFrame(frame)) {
    handleAuthRequired();
    if (frame.ok) {
      throw new Error("UNAUTHORIZED: Gateway requires authentication.");
    }
  }
  if (!frame.ok) {
    const suffix = frame.error.requiredScope
      ? ` (requires ${frame.error.requiredScope})`
      : "";
    throw new Error(`${frame.error.code}: ${frame.error.message}${suffix}`);
  }
  return frame.payload as T;
}
