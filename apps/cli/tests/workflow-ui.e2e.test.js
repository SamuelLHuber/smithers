import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  REPO_ROOT,
  createExecutableDir,
  createTempRepo,
  runSmithers,
  writeFakeAntigravityBinary,
  writeFakeClaudeBinary,
  writeFakeCodexBinary,
} from "../../../packages/smithers/tests/e2e-helpers.js";

/**
 * Real-browser e2e for the init-pack workflow UIs. Boots the FULL chain with no
 * mocking: `smithers init` scaffolds .smithers/, a fake-agent `smithers workflow
 * plan` run produces real output, the generated gateway.ts is booted, and a
 * headless Chromium loads the Gateway-served Plan UI at /workflows/plan?runId=
 * and asserts it renders that run's real plan (summary + steps).
 *
 * Everything lives in ONE test body: createTempRepo/createExecutableDir register
 * their cleanup via onTestFinished, so the temp repo must stay alive for the
 * whole test (a beforeAll would let bun tear it down mid-test). Runs under bun
 * (the init helpers shell out to `bun`; the gateway uses bun:sqlite); Chromium
 * comes from the studio-2 Playwright install, resolved via the repo root.
 */

// The fake agent (writeFakeClaudeBinary) returns this deterministic payload, so
// the Plan node output is { summary, steps } we can assert on exactly.
const FAKE_SUMMARY = "mock agent completed the task";
const FAKE_STEPS = ["inspect", "implement", "verify"];

const PORT = 7356;
const BASE = `http://127.0.0.1:${PORT}`;

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    return (await import(resolve(REPO_ROOT, "apps/smithers-studio-2/node_modules/playwright/index.js"))).chromium;
  }
}

async function waitForHealth(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

test("Plan UI renders the run's real plan output in a real browser", async () => {
  const binDir = createExecutableDir();
  writeFakeClaudeBinary(binDir);
  writeFakeCodexBinary(binDir);
  writeFakeAntigravityBinary(binDir);
  const repo = createTempRepo();
  const env = {
    HOME: repo.dir,
    PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "test-openai-key",
    GEMINI_API_KEY: "",
    GOOGLE_API_KEY: "",
  };
  repo.write(".claude/.credentials.json", "{}\n");
  repo.write(".codex/auth.json", "{}\n");
  repo.write(".gemini/antigravity-cli/settings.json", "{}\n");

  expect(runSmithers(["init"], { cwd: repo.dir, format: "json", env }).exitCode).toBe(0);

  const run = runSmithers(["workflow", "plan", "--prompt", "Ship the new login flow"], {
    cwd: repo.dir,
    format: "json",
    env,
  });
  expect(run.exitCode).toBe(0);
  const planRunId = run.json?.runId;
  expect(typeof planRunId).toBe("string");

  const gatewayProc = spawn(process.execPath, ["run", ".smithers/gateway.ts"], {
    cwd: repo.dir,
    env: { ...process.env, ...env, PORT: String(PORT), HOST: "127.0.0.1" },
    stdio: "ignore",
  });
  let browser;
  try {
    expect(await waitForHealth()).toBe(true);
    browser = await (await loadChromium()).launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${BASE}/workflows/plan?runId=${planRunId}`, { waitUntil: "networkidle" });

    // The bespoke Plan UI mounted and bound to the deep-linked run.
    await page.waitForSelector('[data-testid="plan-ui"]', { timeout: 15_000 });
    expect(await page.getByTestId("plan-runid").textContent()).toContain(planRunId.slice(0, 8));

    // Wait for the async node-output fetch to populate the prominent summary
    // card, then assert it shows the run's real plan summary.
    await page.waitForFunction(
      (expected) => {
        const el = document.querySelector('[data-testid="plan-summary"]');
        return Boolean(el && el.textContent && el.textContent.includes(expected));
      },
      FAKE_SUMMARY,
      { timeout: 15_000 },
    );
    expect(await page.getByTestId("plan-summary").textContent()).toContain(FAKE_SUMMARY);

    // The numbered steps reflect the real plan output (one <li> per step).
    expect(await page.getByTestId("plan-step").count()).toBe(FAKE_STEPS.length);
    const stepsText = (await page.getByTestId("plan-steps").textContent()) ?? "";
    for (const step of FAKE_STEPS) {
      expect(stepsText).toContain(step);
    }

    // The recent-runs rail lists this run, attributed to the plan workflow
    // (exercises the gateway's shared-DB run attribution fix end to end).
    expect(await page.getByTestId(`plan-run-${planRunId}`).count()).toBe(1);
  } finally {
    try { await browser?.close(); } catch {}
    try { gatewayProc.kill("SIGTERM"); } catch {}
  }
}, 120_000);
