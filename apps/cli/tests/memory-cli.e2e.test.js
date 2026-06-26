import { expect, test } from "bun:test";
import {
  createExecutableDir,
  createTempRepo,
  runSmithers,
  writeFakeClaudeBinary,
  writeFakeCodexBinary,
} from "../../../packages/smithers/tests/e2e-helpers.js";

/**
 * `smithers memory get/set/rm/list` must work against the shared workspace store
 * WITHOUT `--workflow`. Memory facts live in `.smithers/smithers.db`, not in any
 * single workflow, so requiring `--workflow` (the regression this guards) made
 * the documented `smithers memory set workflow:ns key value` fail with
 * `VALIDATION_ERROR: expected string, received undefined` on the `workflow`
 * option. A real `smithers init` + a real round-trip against the real store; the
 * only stub is the standard fake agent so `init` resolves a detected agent.
 */

function setupRepo() {
  const binDir = createExecutableDir();
  writeFakeClaudeBinary(binDir);
  writeFakeCodexBinary(binDir);
  const repo = createTempRepo();
  const env = {
    HOME: repo.dir,
    PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "test-openai-key",
  };
  repo.write(".claude/.credentials.json", "{}\n");
  repo.write(".codex/auth.json", "{}\n");
  expect(runSmithers(["init"], { cwd: repo.dir, format: "json", env }).exitCode).toBe(0);
  return { repo, env };
}

test("memory set/get/list/rm round-trips against the workspace store with no --workflow flag", () => {
  const { repo, env } = setupRepo();
  const ns = "workflow:memcli";
  const opts = { cwd: repo.dir, env };

  // set — the exact documented form that used to fail with VALIDATION_ERROR.
  const set = runSmithers(["memory", "set", ns, "answer", "mem-roundtrip-7"], opts);
  expect(set.exitCode).toBe(0);

  // get — prints the stored value back (as its JSON value).
  const get = runSmithers(["memory", "get", ns, "answer"], opts);
  expect(get.exitCode).toBe(0);
  expect(get.stdout).toContain("mem-roundtrip-7");

  // list — the namespace shows the key.
  const list = runSmithers(["memory", "list", ns], opts);
  expect(list.exitCode).toBe(0);
  expect(list.stdout).toContain("answer");

  // rm — deletes it, and a follow-up get reports the miss cleanly (exit 0).
  expect(runSmithers(["memory", "rm", ns, "answer"], opts).exitCode).toBe(0);
  const missed = runSmithers(["memory", "get", ns, "answer"], opts);
  expect(missed.exitCode).toBe(0);
  expect(missed.stdout.toLowerCase()).toContain("no fact");
}, 120_000);

test("memory set still accepts an explicit --workflow pointing at a pack workflow", () => {
  const { repo, env } = setupRepo();
  const opts = { cwd: repo.dir, env };
  const set = runSmithers(
    ["memory", "set", "workflow:memcli", "k", "wf-flag-ok-9", "--workflow", ".smithers/workflows/hello.tsx"],
    opts,
  );
  expect(set.exitCode).toBe(0);
  const get = runSmithers(["memory", "get", "workflow:memcli", "k"], opts);
  expect(get.exitCode).toBe(0);
  expect(get.stdout).toContain("wf-flag-ok-9");
}, 120_000);
