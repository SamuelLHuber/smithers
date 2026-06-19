import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runGh } from "../../src/github/runGh";

const FAKE_GH = fileURLToPath(new URL("./fixtures/fake-gh", import.meta.url));

afterEach(() => {
  delete process.env.SMITHERS_GH_BIN;
  delete process.env.SMITHERS_FAKE_GH_LOG;
});

describe("runGh", () => {
  // TEMPORARY DIAGNOSTIC: dump the first N raw spawns to learn the exact no-op
  // behavior on the Linux CI runner. Restored to the real assertions next round.
  test("DIAGNOSTIC: trace first spawns", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-diag-"));
    process.env.SMITHERS_GH_BIN = FAKE_GH;
    const trace: string[] = [];
    let firstOk = -1;
    for (let i = 1; i <= 15; i++) {
      const log = join(tmp, `log-${i}.json`);
      process.env.SMITHERS_FAKE_GH_LOG = log;
      const r = spawnSync(FAKE_GH, ["api", "ok"], {
        cwd: tmp,
        input: "payload",
        encoding: "utf8",
        env: process.env,
      });
      const out = r.stdout ?? "";
      const err = r.stderr ?? "";
      trace.push(
        `#${i} st=${r.status} sig=${r.signal ?? "·"} err=${r.error?.message ?? "·"} ` +
          `outLen=${out.length} out=${JSON.stringify(out.slice(0, 20))} ` +
          `stderr=${JSON.stringify(err.slice(0, 40))} log=${existsSync(log)}`,
      );
      if (firstOk === -1 && out === "fixture stdout") firstOk = i;
    }
    await rm(tmp, { recursive: true, force: true });
    throw new Error(`firstOk=${firstOk}\n${trace.join("\n")}`);
  });

  // Real test, kept so its shape is preserved; skipped during the diagnostic.
  test.skip("executes gh in the repo directory, passes stdin, and reports stderr on failure", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-"));
    const log = join(tmp, "gh-log.json");
    process.env.SMITHERS_GH_BIN = FAKE_GH;
    process.env.SMITHERS_FAKE_GH_LOG = log;
    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      expect(stdout).toBe("fixture stdout");
      await expect(Bun.file(log).json()).resolves.toEqual({
        cwd: await realpath(tmp),
        args: ["api", "ok"],
        input: "payload",
      });
      await expect(runGh(tmp, ["api", "fail"], "")).rejects.toThrow("fixture failure");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
