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
    // A fake `gh` as a POSIX sh script. `/bin/sh` is always present, is named by
    // an absolute interpreter path (no PATH/`env` lookup), and starts in ~1ms
    // with no language-runtime cold start. An earlier `#!/usr/bin/env node`
    // fixture intermittently never executed its body on the Linux CI runner
    // (exit 0, no output, ~3ms — the node interpreter never ran), which read back
    // as runGh returning "". The script records the invocation (cwd via `pwd -P`
    // to match realpath, args, stdin) to a log file, then echoes deterministic
    // output. Injected by absolute path via SMITHERS_GH_BIN so it runs regardless
    // of PATH lookup.
    const ghPath = join(bin, "gh");
    await writeFile(
      ghPath,
      `#!/bin/sh
log=${JSON.stringify(log)}
input=$(cat)
printf '{"cwd":"%s","args":[' "$(pwd -P)" > "$log"
first=1
for a in "$@"; do
  [ "$first" -eq 1 ] || printf ',' >> "$log"
  first=0
  printf '"%s"' "$a" >> "$log"
done
printf '],"input":"%s"}' "$input" >> "$log"
for a in "$@"; do
  [ "$a" = fail ] && { printf 'fixture failure' >&2; exit 7; }
done
printf 'fixture stdout'
`,
      { mode: 0o755 },
    );
    process.env.SMITHERS_GH_BIN = ghPath;

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      // Surface whether the fixture ran (did it write its log?) when the output
      // mismatches, so a recurrence is diagnosable, not a bare Expected/Received.
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
