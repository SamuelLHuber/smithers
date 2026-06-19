import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGh } from "../../src/github/runGh";

const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;
});

describe("runGh", () => {
  test("executes gh in the repo directory, passes stdin, and reports stderr on failure", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-"));
    const bin = join(tmp, "bin");
    const log = join(tmp, "gh-log.json");
    await mkdir(bin);
    // A fake `gh` implemented as a node script: node reliably flushes its pipe
    // writes on exit (a bun fixture dropped its final stdout write on the Linux
    // CI runner). It records the invocation and echoes deterministic output.
    await writeFile(
      join(bin, "gh"),
      `#!/usr/bin/env node
const { writeFileSync } = require("node:fs");
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  writeFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), input }));
  if (process.argv.includes("fail")) {
    process.stderr.write("fixture failure");
    process.exit(7);
  }
  process.stdout.write("fixture stdout");
});
`,
      { mode: 0o755 },
    );
    process.env.PATH = `${bin}:${originalPath ?? ""}`;

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      // Surface whether the fixture ran at all (did it write its log?) so a
      // recurrence is diagnosable instead of a bare Expected/Received mismatch.
      if (stdout !== "fixture stdout") {
        const logState = existsSync(log)
          ? readFileSync(log, "utf8")
          : "<fixture never ran: no log written>";
        throw new Error(`runGh returned ${JSON.stringify(stdout)}; fixture log: ${logState}`);
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
