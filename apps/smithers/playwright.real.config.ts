import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const appPort = process.env.SMITHERS_REAL_APP_PORT || "5375";
const gatewayPort = process.env.SMITHERS_REAL_GATEWAY_PORT || "7342";
const gatewayHost = process.env.SMITHERS_REAL_GATEWAY_HOST || "127.0.0.1";
const plueUrl = process.env.PLUE_API_BASE_URL || "http://127.0.0.1:4000";
const gatewayUrl = `http://${gatewayHost}:${gatewayPort}`;
const appUrl = `http://127.0.0.1:${appPort}`;
const appDir = fileURLToPath(new URL(".", import.meta.url));

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const exportPrefix = "export ";
    const body = line.startsWith(exportPrefix) ? line.slice(exportPrefix.length).trim() : line;
    const equals = body.indexOf("=");
    if (equals <= 0) continue;

    const key = body.slice(0, equals).trim();
    let value = body.slice(equals + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const localEnv = parseEnvFile(resolve(appDir, ".env.e2e.local"));
const gatewayEnv = {
  ...localEnv,
  PORT: gatewayPort,
  HOST: gatewayHost,
};

if (!localEnv.ANTHROPIC_API_KEY) {
  delete gatewayEnv.ANTHROPIC_API_KEY;
}

const onboardedStorageState = {
  cookies: [],
  origins: [
    {
      origin: appUrl,
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
  testDir: "./tests/e2e-real",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : "html",
  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
    storageState: onboardedStorageState,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bash ../../scripts/e2e-real/plue-up.sh",
      url: `${plueUrl}/api/health`,
      reuseExistingServer: true,
      timeout: 240_000,
    },
    {
      command: "bun ../../.smithers/gateway.ts",
      url: `${gatewayUrl}/health`,
      reuseExistingServer: true,
      timeout: 60_000,
      env: gatewayEnv,
    },
    {
      command: `vite --host 127.0.0.1 --port ${appPort} --strictPort`,
      port: parseInt(appPort, 10),
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        SMITHERS_AUTH_PROXY_TARGET: plueUrl,
        SMITHERS_PLATFORM_PROXY_TARGET: plueUrl,
        SMITHERS_GATEWAY_PROXY_TARGET: gatewayUrl,
      },
    },
  ],
});
