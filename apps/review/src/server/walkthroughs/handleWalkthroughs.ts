import type { ReviewWorkerEnv } from "../env.ts";
import { jsonError } from "../jsonError.ts";
import { authenticateProxyRequest } from "../proxy/authenticateProxyRequest.ts";
import { timingSafeStringEqual } from "../timingSafeStringEqual.ts";

const MAX_WALKTHROUGH_BYTES = 25 * 1024 * 1024;

function newWalkthroughId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join("");
}

/**
 * POST /api/walkthroughs — store an HTML walkthrough on R2 under a random
 * capability key.
 *
 * Accepts three credentials in order of preference:
 *  1. Bearer REVIEW_PUBLISH_TOKEN (legacy, unchanged).
 *  2. A valid session token (action-issued, via x-api-key or Bearer).
 *  3. A valid srk_ API key (operator-issued, via x-api-key or Bearer).
 */
export async function handleWalkthroughs(
  request: Request,
  env: ReviewWorkerEnv,
  url: URL,
  now: number,
): Promise<Response> {
  const publishToken = env.REVIEW_PUBLISH_TOKEN ?? "";
  const auth = request.headers.get("authorization") ?? "";
  const legacyOk = publishToken && timingSafeStringEqual(auth, `Bearer ${publishToken}`);
  if (!legacyOk) {
    const credential = await authenticateProxyRequest(request, env, now);
    if (!credential) return jsonError(401, "unauthorized");
  }
  const html = await request.arrayBuffer();
  if (html.byteLength === 0) return jsonError(400, "empty body");
  if (html.byteLength > MAX_WALKTHROUGH_BYTES) return jsonError(413, "walkthrough exceeds 25MB");
  const id = newWalkthroughId();
  await env.WALKTHROUGHS.put(`walkthroughs/${id}.html`, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });
  const base = (env.PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, "");
  return Response.json({ id, url: `${base}/w/${id}` }, { status: 201 });
}
