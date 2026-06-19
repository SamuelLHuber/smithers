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
    // A fake `gh` as a node script: read stdin synchronously, record the
    // invocation, then echo deterministic output. Injected by absolute path via
    // SMITHERS_GH_BIN so it runs regardless of PATH lookup.
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

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      if (stdout !== "fixture stdout") {
        // Replicate runGh's exact spawn to localize a recurrence (does
        // Bun.spawnSync with cwd run the fixture, or is cwd the problem?).
        const probe = Bun.spawnSync([ghPath, "api", "ok"], {
          cwd: tmp,
          stdin: new TextEncoder().encode("payload"),
        });
        const logState = existsSync(log)
          ? readFileSync(log, "utf8")
          : "<fixture never ran: no log written>";
        throw new Error(
          `runGh=${JSON.stringify(stdout)} | log=${logState} | probe=${JSON.stringify({
            exitCode: probe.exitCode,
            stdout: new TextDecoder().decode(probe.stdout),
            stderr: new TextDecoder().decode(probe.stderr),
          })}`,
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
