/**
 * Bindings available to the Cloudflare Worker at runtime. `CEREBRAS_API_KEY` is
 * a Cloudflare secret (set by Alchemy from the deploy environment); `ASSETS` is
 * the static-assets fetcher the platform injects for the built PWA.
 */
export interface CloudflareEnv {
  CEREBRAS_API_KEY: string;
  /**
   * Override for the upstream OpenAI-compatible base URL. Defaults to Cerebras
   * in production; e2e fixtures point it at a local deterministic SSE server so
   * the whole gateway path can be exercised without a real key.
   */
  CEREBRAS_BASE_URL?: string;
  /** Override for the upstream model id. Defaults to gpt-oss-120b. */
  CEREBRAS_MODEL?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}
