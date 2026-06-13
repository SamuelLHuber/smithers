import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const appPort = process.env.SMITHERS_REAL_APP_PORT || "5375";
const gatewayPort = process.env.SMITHERS_REAL_GATEWAY_PORT || "7342";
const workerPort = process.env.SMITHERS_REAL_WORKER_PORT || "5376";
const plueApiBaseUrl = process.env.PLUE_API_BASE_URL || "http://127.0.0.1:4000";
const appOrigin = `http://127.0.0.1:${appPort}`;
const gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;
const workerOrigin = `http://127.0.0.1:${workerPort}`;

function onboardedOrigin(origin: string) {
  return {
    origin,
    localStorage: [
      {
        name: "smithers.onboarding",
        value: JSON.stringify({ state: { completed: true }, version: 0 }),
      },
    ],
  };
}

function readLocalEnv(): Record<string, string> {
  const envPath = resolve(import.meta.dirname, ".env.e2e.local");
  if (!existsSync(envPath)) {
    return {};
  }

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const onboardedStorageState = {
  cookies: [],
  origins: [onboardedOrigin(appOrigin)],
};

const localEnv = readLocalEnv();
const chatUpstreamEnv = {
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY ?? localEnv.CEREBRAS_API_KEY,
  CEREBRAS_BASE_URL:
    process.env.CEREBRAS_BASE_URL ?? localEnv.CEREBRAS_BASE_URL,
  CEREBRAS_MODEL: process.env.CEREBRAS_MODEL ?? localEnv.CEREBRAS_MODEL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? localEnv.GEMINI_API_KEY,
  SMITHERS_E2E_CHAT_MODEL:
    process.env.SMITHERS_E2E_CHAT_MODEL ?? localEnv.SMITHERS_E2E_CHAT_MODEL,
};

export default defineConfig({
  testDir: "./tests/e2e-real",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: appOrigin,
    trace: "on-first-retry",
    storageState: onboardedStorageState,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bash ../../scripts/e2e-real/plue-up.sh",
      url: `${plueApiBaseUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: "bash ../../scripts/e2e-real/gateway-up.sh",
      url: `${gatewayOrigin}/workflows/e2e-approval-probe`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        ...localEnv,
        PORT: gatewayPort,
        HOST: "127.0.0.1",
      },
    },
    {
      command: "bun ../../scripts/e2e-real/worker.ts",
      url: `${workerOrigin}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        ...chatUpstreamEnv,
        SMITHERS_REAL_WORKER_PORT: workerPort,
        AUTH_API_BASE_URL: plueApiBaseUrl,
        PLUE_API_BASE_URL: plueApiBaseUrl,
        GO_API_BASE_URL: plueApiBaseUrl,
        GATEWAY_BASE_URL: gatewayOrigin,
      },
    },
    {
      command: "bash ../../scripts/e2e-real/vite-up.sh",
      url: appOrigin,
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        SMITHERS_AUTH_PROXY_TARGET: plueApiBaseUrl,
        SMITHERS_PLATFORM_PROXY_TARGET: plueApiBaseUrl,
        SMITHERS_GATEWAY_PROXY_TARGET: gatewayOrigin,
        SMITHERS_CHAT_PROXY_TARGET: workerOrigin,
      },
    },
  ],
});
