/**
 * Alchemy infrastructure-as-code for Smithers.
 *
 * Deploys the PWA to Cloudflare as a single Worker that:
 *   - serves the built Vite app (dist/) as static assets with SPA routing, and
 *   - handles POST /api/chat by running Cerebras (`zai-glm-4.7`) server-side.
 *
 * Deploy:   bun run deploy        (or: pnpm deploy)
 * Destroy:  bun run destroy
 *
 * Required env: CEREBRAS_API_KEY (stored as a Cloudflare secret) and Cloudflare
 * credentials (CLOUDFLARE_API_TOKEN, and CLOUDFLARE_ACCOUNT_ID if you have more
 * than one account). Optional remote-mode env: AUTH_API_BASE_URL,
 * AUTH_CALLBACK_BASE_URL, GATEWAY_BASE_URL, GATEWAY_AUTH_TOKEN,
 * GO_API_BASE_URL, AUTH_REQUIRED, GATEWAY_TRUSTED_PROXY_SCOPES,
 * GATEWAY_TRUSTED_PROXY_ROLE.
 */
import alchemy from "alchemy";
import { Website, DurableObjectNamespace } from "alchemy/cloudflare";

const app = await alchemy("smithers");

const cerebrasApiKey = process.env.CEREBRAS_API_KEY;
if (!cerebrasApiKey) {
  throw new Error(
    "CEREBRAS_API_KEY is required to deploy. Set it in your environment or pass --env-file.",
  );
}

const optionalBindingNames = [
  "AUTH_API_BASE_URL",
  "PLUE_API_BASE_URL",
  "AUTH_CALLBACK_BASE_URL",
  "GATEWAY_BASE_URL",
  "GO_API_BASE_URL",
  "AUTH_REQUIRED",
  "GATEWAY_TRUSTED_PROXY_SCOPES",
  "GATEWAY_TRUSTED_PROXY_ROLE",
  "PAIR_KEYS",
  "PAIR_VM_ID",
  "PAIR_CODEX_WORKDIR",
] as const;

const optionalBindings = Object.fromEntries(
  optionalBindingNames.flatMap((name) => {
    const value = process.env[name]?.trim();
    return value ? [[name, value]] : [];
  }),
);

const gatewayAuthToken = process.env.GATEWAY_AUTH_TOKEN?.trim();
const pairFreestyleKey = process.env.PAIR_FREESTYLE_API_KEY?.trim();

// Smithers Pair realtime backend: a single Durable Object hosts the shared
// room (ElectricSQL shape sync); it calls Codex in a Freestyle sandbox.
const pairSync = DurableObjectNamespace("pair-sync", {
  className: "PairSync",
  sqlite: true,
});

export const site = await Website("smithers", {
  // The Worker entry that serves /api/chat. Static assets come from `assets`.
  entrypoint: "src/worker.ts",
  // Build the PWA before deploying; output lands in dist/.
  build: { command: "vite build" },
  assets: "dist",
  // Serve index.html for client-side routes that don't match a static asset.
  spa: true,
  // The OpenAI SDK (used by the Cerebras adapter) needs Node compatibility.
  compatibilityDate: "2025-05-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: {
    CEREBRAS_API_KEY: alchemy.secret(cerebrasApiKey),
    ...(gatewayAuthToken ? { GATEWAY_AUTH_TOKEN: alchemy.secret(gatewayAuthToken) } : {}),
    ...(pairFreestyleKey ? { PAIR_FREESTYLE_API_KEY: alchemy.secret(pairFreestyleKey) } : {}),
    PAIR_SYNC: pairSync,
    ...optionalBindings,
  },
});

console.log(`Smithers deployed → ${site.url}`);

await app.finalize();
