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
 *   3. vite                — the app, proxying /api/chat to the Worker host
 *      (same-origin) so the browser's real fetch path is exercised.
 *
 * Every port is env-configurable so parallel runs can offset the whole stack.
 */

const testPort = process.env.SMITHERS_TEST_PORT || "5275";
const workerPort = process.env.SMITHERS_WORKER_TEST_PORT || "5276";
const upstreamPort = process.env.SMITHERS_UPSTREAM_TEST_PORT || "5277";

const workerUrl = `http://127.0.0.1:${workerPort}`;
const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

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
      command: `vite --host 127.0.0.1 --port ${testPort} --strictPort`,
      port: parseInt(testPort, 10),
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { SMITHERS_CHAT_PROXY_TARGET: workerUrl },
    },
  ],
});
