import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openaiCompatible } from "@tanstack/ai-openai/compatible";
import type { CloudflareEnv } from "./env";

/** Cerebras' OpenAI-compatible Chat Completions endpoint (default upstream). */
const DEFAULT_CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

/** The Cerebras model the chat runs on — the very fast gpt-oss-120b. */
const DEFAULT_CEREBRAS_MODEL = "gpt-oss-120b";

/** Most messages we will forward to Cerebras in a single request. */
const MAX_MESSAGES = 100;

/** Cap on the summed byte length of all message content (~100KB). */
const MAX_CONTENT_BYTES = 100 * 1024;

/** Cap on the client-supplied system prompt (~4KB); longer ones are truncated. */
const MAX_SYSTEM_BYTES = 4 * 1024;

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatBody = {
  messages: Array<ChatMessage>;
  /** Optional system prompt prepended to the conversation. */
  system?: string;
};

type AuthenticatedProxyUser = {
  id: string;
  username: string;
  isAdmin: boolean;
};

type AuthValidation =
  | { ok: true; user: AuthenticatedProxyUser }
  | { ok: false; status: number; message: string };

const encoder = new TextEncoder();

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

const TRUSTED_PROXY_HEADERS = [
  "x-user-id",
  "x-user-scopes",
  "x-user-role",
  "x-smithers-token-id",
];

const GATEWAY_CREDENTIAL_HEADERS = ["authorization", "x-smithers-key"];

const DEFAULT_GATEWAY_SCOPES = [
  "run:read",
  "run:write",
  "approval:submit",
  "signal:submit",
  "cron:read",
  "cron:write",
  "observability:read",
];

function isChatMessage(value: unknown): value is ChatMessage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}

type ValidationResult =
  | { ok: true; body: ChatBody }
  | { ok: false; status: number; message: string };

/**
 * Validate the parsed request body without trusting any field. A valid-JSON
 * `null`/number/array yields a clean 400 rather than a thrown 500. Enforces the
 * message-count, content-size, and system-prompt caps before the key is touched.
 */
function validateChatBody(parsed: unknown): ValidationResult {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, message: "Request body must be a JSON object" };
  }
  const candidate = parsed as Record<string, unknown>;

  if (!Array.isArray(candidate.messages)) {
    return { ok: false, status: 400, message: "Request body must include messages[]" };
  }
  if (candidate.messages.length > MAX_MESSAGES) {
    return {
      ok: false,
      status: 413,
      message: `Too many messages (max ${MAX_MESSAGES})`,
    };
  }

  let contentBytes = 0;
  for (const message of candidate.messages) {
    if (!isChatMessage(message)) {
      return {
        ok: false,
        status: 400,
        message:
          'Each message must have role "user" or "assistant" and string content',
      };
    }
    contentBytes += encoder.encode(message.content).length;
    if (contentBytes > MAX_CONTENT_BYTES) {
      return {
        ok: false,
        status: 413,
        message: `Message content too large (max ${MAX_CONTENT_BYTES} bytes)`,
      };
    }
  }

  let system: string | undefined;
  if (candidate.system !== undefined) {
    if (typeof candidate.system !== "string") {
      return { ok: false, status: 400, message: "system must be a string" };
    }
    // Bound the client-supplied prompt by bytes so it cannot be abused, then
    // decode back to a string (slicing on a byte boundary is fine: any partial
    // trailing UTF-8 sequence is dropped by the lossy decoder).
    const encoded = encoder.encode(candidate.system);
    system =
      encoded.length > MAX_SYSTEM_BYTES
        ? new TextDecoder().decode(encoded.slice(0, MAX_SYSTEM_BYTES))
        : candidate.system;
  }

  return {
    ok: true,
    body: { messages: candidate.messages as ChatMessage[], system },
  };
}

function envUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    return null;
  }
}

function authBaseUrl(env: CloudflareEnv): URL | null {
  return envUrl(env.AUTH_API_BASE_URL ?? env.PLUE_API_BASE_URL);
}

function gatewayBaseUrl(env: CloudflareEnv): URL | null {
  return envUrl(env.GATEWAY_BASE_URL);
}

function platformBaseUrl(env: CloudflareEnv): URL | null {
  return envUrl(env.GO_API_BASE_URL ?? env.AUTH_API_BASE_URL ?? env.PLUE_API_BASE_URL);
}

function authCallbackBaseUrl(request: Request, env: CloudflareEnv): URL {
  return envUrl(env.AUTH_CALLBACK_BASE_URL) ?? new URL(new URL(request.url).origin);
}

function joinedTargetUrl(base: URL, pathname: string, search = ""): URL {
  const target = new URL(base.toString());
  const basePath = target.pathname.replace(/\/+$/, "");
  target.pathname = `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  target.search = search;
  target.hash = "";
  return target;
}

function proxyTargetUrl(request: Request, base: URL): URL {
  const source = new URL(request.url);
  return joinedTargetUrl(base, source.pathname, source.search);
}

function isAuthProxyRoute(pathname: string): boolean {
  return pathname.startsWith("/api/auth/") || pathname === "/api/user" || pathname.startsWith("/api/user/");
}

function isGatewayProxyRoute(pathname: string): boolean {
  return pathname === "/health" || pathname.startsWith("/v1/rpc") || pathname.startsWith("/workflows");
}

/**
 * jjhub (Plue) code-hosting REST routes. Disjoint from the auth proxy, which
 * already owns `/api/user*` (jjhub's repo list lives at `/api/user/repos`).
 * Credentials forward straight through; jjhub validates the session itself.
 */
function isPlatformProxyRoute(pathname: string): boolean {
  return (
    pathname === "/api/repos" ||
    pathname.startsWith("/api/repos/") ||
    pathname === "/api/orgs" ||
    pathname.startsWith("/api/orgs/") ||
    pathname === "/api/search" ||
    pathname.startsWith("/api/search/") ||
    pathname === "/api/notifications" ||
    pathname.startsWith("/api/notifications/") ||
    pathname.startsWith("/api/integrations/") ||
    pathname.startsWith("/api/oauth2/") ||
    pathname.startsWith("/resolve/")
  );
}

function proxyHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  const source = new URL(request.url);
  headers.set("x-forwarded-host", source.host);
  headers.set("x-forwarded-proto", source.protocol.replace(":", ""));
  return headers;
}

function stripTrustedProxyHeaders(headers: Headers): void {
  for (const name of TRUSTED_PROXY_HEADERS) {
    headers.delete(name);
  }
}

function stripGatewayCredentialHeaders(headers: Headers): void {
  for (const name of GATEWAY_CREDENTIAL_HEADERS) {
    headers.delete(name);
  }
}

function gatewayAuthToken(env: CloudflareEnv): string | null {
  const token = env.GATEWAY_AUTH_TOKEN?.trim();
  if (!token) return null;
  return token.replace(/^(bearer|token)\s+/i, "").trim() || null;
}

function addGatewayCredential(headers: Headers, token: string): void {
  stripGatewayCredentialHeaders(headers);
  headers.set("authorization", `Bearer ${token}`);
}

function rewriteProxyLocation(headers: Headers, request: Request, upstreamBase: URL): void {
  const location = headers.get("location");
  if (!location) return;
  let upstreamLocation: URL;
  try {
    upstreamLocation = new URL(location, upstreamBase);
  } catch {
    return;
  }
  if (upstreamLocation.origin !== upstreamBase.origin) return;

  const basePath = upstreamBase.pathname.replace(/\/+$/, "");
  let pathname = upstreamLocation.pathname;
  if (basePath && pathname.startsWith(`${basePath}/`)) {
    pathname = pathname.slice(basePath.length);
  }
  const requestOrigin = new URL(request.url).origin;
  const rewritten = new URL(`${pathname}${upstreamLocation.search}${upstreamLocation.hash}`, requestOrigin);
  headers.set("location", rewritten.toString());
}

function authCallbackPath(pathname: string): string | null {
  if (pathname === "/api/auth/workos/authorize") return "/api/auth/workos/callback";
  if (pathname === "/api/auth/auth0/authorize") return "/api/auth/auth0/callback";
  if (pathname === "/api/auth/github") return "/api/auth/github/callback";
  return null;
}

function rewriteOAuthRedirectUri(headers: Headers, request: Request, env: CloudflareEnv): void {
  const callbackPath = authCallbackPath(new URL(request.url).pathname);
  if (!callbackPath) return;
  const location = headers.get("location");
  if (!location) return;
  let authorizeUrl: URL;
  try {
    authorizeUrl = new URL(location);
  } catch {
    return;
  }
  if (!authorizeUrl.searchParams.has("redirect_uri")) return;
  const callback = new URL(callbackPath, authCallbackBaseUrl(request, env));
  authorizeUrl.searchParams.set("redirect_uri", callback.toString());
  headers.set("location", authorizeUrl.toString());
}

async function proxyWithHeaders(request: Request, base: URL, headers: Headers): Promise<Response> {
  const target = proxyTargetUrl(request, base);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }
  const response = await fetch(target.toString(), init);
  const responseHeaders = new Headers(response.headers);
  rewriteProxyLocation(responseHeaders, request, base);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

function proxyRequest(request: Request, base: URL): Promise<Response> {
  return proxyWithHeaders(request, base, proxyHeaders(request));
}

async function proxyAuthRequest(request: Request, env: CloudflareEnv, base: URL): Promise<Response> {
  const response = await proxyWithHeaders(request, base, proxyHeaders(request));
  const headers = new Headers(response.headers);
  rewriteOAuthRedirectUri(headers, request, env);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function parseAuthenticatedUser(payload: unknown): AuthenticatedProxyUser | null {
  if (payload === null || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const id = record.id;
  const username = record.username;
  if ((typeof id !== "string" && typeof id !== "number") || typeof username !== "string") {
    return null;
  }
  return {
    id: String(id),
    username,
    isAdmin: record.is_admin === true,
  };
}

async function validateAuth(request: Request, base: URL): Promise<AuthValidation> {
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const origin = request.headers.get("origin");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (origin) headers.set("origin", origin);
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(joinedTargetUrl(base, "/api/user").toString(), {
      method: "GET",
      headers,
      redirect: "manual",
    });
  } catch {
    return { ok: false, status: 502, message: "Authentication service unavailable" };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: response.status === 403 ? "Forbidden" : "Authentication required",
    };
  }

  const user = parseAuthenticatedUser(await response.json().catch(() => null));
  if (!user) {
    return { ok: false, status: 401, message: "Auth response did not include a user." };
  }
  return { ok: true, user };
}

function gatewayScopesFor(user: AuthenticatedProxyUser, env: CloudflareEnv): string {
  const configured = env.GATEWAY_TRUSTED_PROXY_SCOPES?.trim();
  if (configured) {
    return configured
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
      .join(" ");
  }
  return (user.isAdmin ? ["run:admin", ...DEFAULT_GATEWAY_SCOPES] : DEFAULT_GATEWAY_SCOPES).join(" ");
}

function addTrustedProxyHeaders(headers: Headers, user: AuthenticatedProxyUser, env: CloudflareEnv): void {
  headers.set("x-user-id", user.id);
  headers.set("x-user-role", env.GATEWAY_TRUSTED_PROXY_ROLE?.trim() || (user.isAdmin ? "admin" : "operator"));
  headers.set("x-user-scopes", gatewayScopesFor(user, env));
  headers.set("x-smithers-token-id", `plue:${user.id}`);
}

function gatewayAuthFailure(pathname: string, validation: AuthValidation): Response {
  const status = validation.ok ? 401 : validation.status || 401;
  const message = validation.ok ? "Authentication required" : validation.message;
  if (pathname.startsWith("/v1/rpc")) {
    return new Response(
      JSON.stringify({
        type: "res",
        apiVersion: "v1",
        ok: false,
        error: { code: status === 403 ? "FORBIDDEN" : "UNAUTHORIZED", message },
      }),
      {
        status,
        headers: { "content-type": "application/json" },
      },
    );
  }
  return new Response(message, { status });
}

async function proxyGatewayRequest(request: Request, env: CloudflareEnv, base: URL): Promise<Response> {
  const headers = proxyHeaders(request);
  stripTrustedProxyHeaders(headers);
  stripGatewayCredentialHeaders(headers);

  const token = gatewayAuthToken(env);
  if (token) {
    addGatewayCredential(headers, token);
    return proxyWithHeaders(request, base, headers);
  }

  const authBase = authBaseUrl(env);
  if (!authBase) {
    return gatewayAuthFailure(new URL(request.url).pathname, {
      ok: false,
      status: 401,
      message: "Gateway authentication service is not configured",
    });
  }
  const validation = await validateAuth(request, authBase);
  if (!validation.ok) {
    return gatewayAuthFailure(new URL(request.url).pathname, validation);
  }
  addTrustedProxyHeaders(headers, validation.user, env);

  return proxyWithHeaders(request, base, headers);
}

function chatAuthRequired(env: CloudflareEnv): boolean {
  const value = env.AUTH_REQUIRED?.trim().toLowerCase();
  if (value === "false" || value === "0" || value === "no") return false;
  if (value === "true" || value === "1" || value === "yes") return true;
  return authBaseUrl(env) !== null;
}

async function requireChatAuth(request: Request, env: CloudflareEnv): Promise<Response | null> {
  if (!chatAuthRequired(env)) return null;
  const base = authBaseUrl(env);
  if (!base) {
    return new Response("Server is missing AUTH_API_BASE_URL", { status: 500 });
  }
  const validation = await validateAuth(request, base);
  if (!validation.ok) {
    return new Response(validation.message, { status: validation.status });
  }
  return null;
}

/**
 * POST /api/chat — runs the Cerebras chat on the server via TanStack AI and
 * streams the reply back as Server-Sent Events. The Cerebras key is a Worker
 * secret, so it never reaches the browser.
 */
async function handleChat(request: Request, env: CloudflareEnv): Promise<Response> {
  if (!env.CEREBRAS_API_KEY) {
    return new Response("Server is missing CEREBRAS_API_KEY", { status: 500 });
  }

  // Origin check: require a same-origin Origin header. This blocks cross-site
  // browser abuse and naive no-Origin curl. A determined attacker can forge the
  // header, so this is not a true rate limit; pair it with a Cloudflare Rate
  // Limiting rule for real per-IP limiting (intentionally no infra binding here).
  const origin = request.headers.get("Origin");
  if (origin === null || origin !== new URL(request.url).origin) {
    return new Response("Forbidden: cross-origin request", { status: 403 });
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const validation = validateChatBody(parsed);
  if (!validation.ok) {
    return new Response(validation.message, { status: validation.status });
  }
  const body = validation.body;

  const baseURL = env.CEREBRAS_BASE_URL ?? DEFAULT_CEREBRAS_BASE_URL;
  const model = env.CEREBRAS_MODEL ?? DEFAULT_CEREBRAS_MODEL;
  const cerebras = openaiCompatible({
    name: "cerebras",
    baseURL,
    apiKey: env.CEREBRAS_API_KEY,
    models: [model],
  });

  const stream = chat({
    adapter: cerebras(model),
    messages: body.messages,
    systemPrompts: body.system ? [body.system] : undefined,
  });

  return toServerSentEventsResponse(stream);
}

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const url = new URL(request.url);
    const authBase = authBaseUrl(env);
    const gatewayBase = gatewayBaseUrl(env);

    if (isAuthProxyRoute(url.pathname) && authBase) {
      return proxyAuthRequest(request, env, authBase);
    }

    if (isPlatformProxyRoute(url.pathname)) {
      const platformBase = platformBaseUrl(env);
      if (!platformBase) {
        return new Response("Platform API not configured", { status: 404 });
      }
      return proxyRequest(request, platformBase);
    }

    if (isGatewayProxyRoute(url.pathname)) {
      if (!gatewayBase) {
        return new Response("Gateway not configured", { status: 404 });
      }
      return proxyGatewayRequest(request, env, gatewayBase);
    }

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }
      const authFailure = await requireChatAuth(request, env);
      if (authFailure) {
        return authFailure;
      }
      return handleChat(request, env);
    }

    // Static assets (and the SPA fallback) are served by the platform before a
    // request reaches the Worker. Anything else that lands here is handed to the
    // assets binding when present, otherwise it's a genuine 404.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};
