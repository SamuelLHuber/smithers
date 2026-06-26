import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  createExecutableDir,
  createTempRepo,
  runSmithers,
  writeFakeAntigravityBinary,
  writeFakeClaudeBinary,
  writeFakeCodexBinary,
} from "../../../packages/smithers/tests/e2e-helpers.js";

/**
 * Every seeded workflow `smithers init` installs must RENDER its graph without
 * throwing. `smithers graph` loads the workflow and builds one frame, which runs
 * `createSmithers` and its output-table schema checks but executes no agent — so
 * it is the cheapest trigger for the whole class of load-time authoring bugs.
 *
 * This guards specifically against the reserved-column regression: a seeded
 * workflow whose OUTPUT schema declares a field named `runId`/`nodeId`/
 * `iteration` (e.g. `monitor`'s `gather.runId`) fails to load with
 * `INVALID_INPUT: ... uses reserved field name(s)`, which silently broke
 * `smithers workflow skills` (all) and any attempt to run that workflow. The
 * existing UI e2e only boots each UI's frontend bundle, so it never caught it.
 */

const RESERVED_ERROR = /reserved field name/i;

test("no seeded init-pack workflow declares a reserved output-column field (monitor regression guard)", () => {
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

  const workflowsDir = join(repo.dir, ".smithers", "workflows");
  const files = readdirSync(workflowsDir)
    .filter((f) => f.endsWith(".tsx"))
    .sort();
  // A fresh init seeds a non-trivial set; if this ever drops to a handful the
  // pack is broken, so assert we are actually exercising the catalog.
  expect(files.length).toBeGreaterThan(10);

  // A reserved-column collision throws at createSmithers time, so it surfaces in
  // the graph output for ANY workflow regardless of whether it also needs input
  // to fully render. We assert on exactly that error class (the regression),
  // not on a clean exit — some seeded meta-workflows legitimately need an input
  // to resolve a target before their graph completes.
  const reservedOffenders = [];
  for (const file of files) {
    const rel = join(".smithers", "workflows", file);
    const r = runSmithers(["graph", rel], { cwd: repo.dir, env, timeoutMs: 90_000 });
    if (RESERVED_ERROR.test(`${r.stdout}\n${r.stderr}`)) reservedOffenders.push(file);
  }
  expect(reservedOffenders).toEqual([]);

  // And the previously-broken `monitor` (its `gather` output declared `runId`)
  // now renders its graph cleanly end to end.
  const monitor = runSmithers(["graph", join(".smithers", "workflows", "monitor.tsx")], {
    cwd: repo.dir,
    env,
    timeoutMs: 90_000,
  });
  expect(monitor.exitCode).toBe(0);
}, 600_000);
