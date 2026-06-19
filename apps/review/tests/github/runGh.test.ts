import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGh } from "../../src/github/runGh";

afterEach(() => {
  delete process.env.SMITHERS_GH_BIN;
});

describe("runGh", () => {
  test("executes gh in the repo directory, passes stdin, and reports stderr on failure", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-"));
    const bin = join(tmp, "bin");
    const log = join(tmp, "gh-log.json");
    await mkdir(bin);
    // A fake `gh` as a node script: read stdin synchronously (readFileSync(0))
    // so there is no async event timing, write the invocation log, then echo
    // deterministic output. node flushes its pipe writes on exit.
    const ghPath = join(bin, "gh");
    await writeFile(
      ghPath,
      `#!/usr/bin/env node
const { writeFileSync, readFileSync } = require("node:fs");
let input = "";
try { input = readFileSync(0, "utf8"); } catch {}
writeFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), input }));
if (process.argv.includes("fail")) {
  process.stderr.write("fixture failure");
  process.exit(7);
}
process.stdout.write("fixture stdout");
`,
      { mode: 0o755 },
    );
    process.env.SMITHERS_GH_BIN = ghPath;

    // Ground-truth probe: spawn the fixture directly by absolute path. If this
    // does not yield "fixture stdout", the fixture/runtime is the problem; if it
    // does but runGh fails, runGh's exec is the problem.
    const probe = (() => {
      try {
        const p = Bun.spawnSync([ghPath, "api", "ok"], {
          stdin: new TextEncoder().encode("payload"),
        });
        return {
          exitCode: p.exitCode,
          stdout: new TextDecoder().decode(p.stdout),
          stderr: new TextDecoder().decode(p.stderr),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    })();

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      if (stdout !== "fixture stdout") {
        throw new Error(
          `runGh=${JSON.stringify(stdout)} | SMITHERS_GH_BIN=${process.env.SMITHERS_GH_BIN}` +
            ` | ghPath exists=${existsSync(ghPath)} | direct probe=${JSON.stringify(probe)}` +
            ` | log=${existsSync(log) ? readFileSync(log, "utf8") : "<none>"}`,
        );
      }
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
