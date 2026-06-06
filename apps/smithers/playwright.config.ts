import { defineConfig, devices } from "@playwright/test";

/**
 * Real-backend e2e configuration for the Smithers PWA.
 *
 * The webServer array boots the full stack so specs drive the UI against live
 * services with NO route mocking (see CLAUDE.md "No mocks"):
 *
 *   1. cerebrasUpstream.ts — a real OpenAI-compatible Chat Completions SSE
 *      server seeded with a deterministic reply. Stands in for api.cerebras.ai
 *      so the whole gateway path runs without a real key.
 *   2. workerHost.ts       — the real Cloudflare Worker (src/worker.ts) hosted
 *      on a port, with CEREBRAS_BASE_URL pointed at the upstream above.
 *   3. gatewayFixture.tsx  — a real Smithers gateway running one workflow that
 *      ships a custom UI, executed to a completed run. Exercises the gateway
 *      custom-UI feature end to end (RPC, the served UI bundle, the iframe).
 *   4. vite                — the app, proxying /api/chat to the Worker host and
 *      /v1/rpc + /health + /workflows to the gateway (same-origin) so the
 *      browser's real fetch + iframe paths are exercised.
 *
 * Every port is env-configurable so parallel runs can offset the whole stack.
 */

const testPort = process.env.SMITHERS_TEST_PORT || "5275";
const workerPort = process.env.SMITHERS_WORKER_TEST_PORT || "5276";
const upstreamPort = process.env.SMITHERS_UPSTREAM_TEST_PORT || "5277";
const gatewayPort = process.env.SMITHERS_GATEWAY_TEST_PORT || "5278";

const workerUrl = `http://127.0.0.1:${workerPort}`;
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;
const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

/**
 * Seed the first-run onboarding flag as "completed" for the test origin, so the
 * onboarding overlay (which otherwise covers a brand-new visitor) does not block
 * the rest of the suite. The onboarding spec overrides this with empty storage
 * via `test.use({ storageState })` to drive the real first run.
 */
const onboardedStorageState = {
  cookies: [],
  origins: [
    {
      origin: `http://127.0.0.1:${testPort}`,
      localStorage: [
        {
          name: "smithers.onboarding",
          value: JSON.stringify({ state: { completed: true }, version: 0 }),
        },
      ],
    },
  ],
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: "on-first-retry",
    storageState: onboardedStorageState,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `bun tests/fixtures/cerebrasUpstream.ts`,
      url: `${upstreamUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { SMITHERS_UPSTREAM_PORT: upstreamPort },
    },
    {
      command: `bun tests/fixtures/workerHost.ts`,
      url: `${workerUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        SMITHERS_WORKER_PORT: workerPort,
        CEREBRAS_BASE_URL: `${upstreamUrl}/v1`,
      },
    },
    {
      command: `bun tests/fixtures/gatewayFixture.tsx`,
      url: `${gatewayUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { SMITHERS_GATEWAY_PORT: gatewayPort },
    },
    {
      command: `vite --host 127.0.0.1 --port ${testPort} --strictPort`,
      port: parseInt(testPort, 10),
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        SMITHERS_CHAT_PROXY_TARGET: workerUrl,
        SMITHERS_GATEWAY_PROXY_TARGET: gatewayUrl,
      },
    },
  ],
});
