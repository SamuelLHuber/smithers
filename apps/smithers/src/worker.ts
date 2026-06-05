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

const encoder = new TextEncoder();

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

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
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
