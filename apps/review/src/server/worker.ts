/**
 * Cloudflare Worker serving published walkthroughs at review.smithers.sh.
 *
 * POST /api/walkthroughs  (Bearer REVIEW_PUBLISH_TOKEN, HTML body) -> { id, url }
 * GET  /w/<id>            serve a published walkthrough
 * GET  /                  usage landing page
 *
 * Storage is R2; ids are random capability links, there is no listing.
 */

const MAX_WALKTHROUGH_BYTES = 25 * 1024 * 1024;

type R2ObjectBody = { body: ReadableStream } | null;

type WalkthroughBucket = {
  put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody>;
};

export type ReviewWorkerEnv = {
  WALKTHROUGHS: WalkthroughBucket;
  REVIEW_PUBLISH_TOKEN: string;
  PUBLIC_BASE_URL?: string;
};

const landingPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>smithers review</title>
<style>
body { margin: 0; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #1f2328; background: #f6f8fa; }
main { max-width: 720px; margin: 0 auto; padding: 64px 24px; }
h1 { font-size: 28px; margin: 0 0 8px; }
p { color: #59636e; max-width: 65ch; }
pre { background: #fff; border: 1px solid #d1d9e0; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: 13px; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>
</head>
<body>
<main>
<h1>smithers review</h1>
<p>Code review plus story-form walkthroughs. Walkthroughs published here are unlisted; you need the link.</p>
<p>Publish one from a repo:</p>
<pre><code>smithers-review --from main --to HEAD --publish</code></pre>
<p>Part of <a href="https://github.com/smithersai/smithers">smithers</a>.</p>
</main>
</body>
</html>`;

function newWalkthroughId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: ReviewWorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(landingPage, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (request.method === "POST" && url.pathname === "/api/walkthroughs") {
      const token = env.REVIEW_PUBLISH_TOKEN ?? "";
      const auth = request.headers.get("authorization") ?? "";
      if (!token || !timingSafeEqual(auth, `Bearer ${token}`)) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      const html = await request.arrayBuffer();
      if (html.byteLength === 0) {
        return Response.json({ error: "empty body" }, { status: 400 });
      }
      if (html.byteLength > MAX_WALKTHROUGH_BYTES) {
        return Response.json({ error: "walkthrough exceeds 25MB" }, { status: 413 });
      }
      const id = newWalkthroughId();
      await env.WALKTHROUGHS.put(`walkthroughs/${id}.html`, html, {
        httpMetadata: { contentType: "text/html; charset=utf-8" },
      });
      const base = (env.PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, "");
      return Response.json({ id, url: `${base}/w/${id}` }, { status: 201 });
    }

    if (request.method === "GET" && /^\/w\/[a-z0-9]{8,32}$/.test(url.pathname)) {
      const id = url.pathname.slice("/w/".length);
      const object = await env.WALKTHROUGHS.get(`walkthroughs/${id}.html`);
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.body, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=31536000, immutable",
          "x-robots-tag": "noindex",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
