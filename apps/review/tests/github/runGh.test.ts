import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runGh } from "../../src/github/runGh";

// A checked-in, executable fake `gh`. Earlier revisions wrote the fixture fresh
// in each test and exec'd it immediately; on the Linux CI runner that raced
// (write-then-exec) and Bun.spawnSync returned exit 0 with the script never
// running — empty stdout, no log — regardless of node-vs-sh shebang. A
// committed binary is exec'd, not freshly written, so there is no race.
const FAKE_GH = fileURLToPath(new URL("./fixtures/fake-gh", import.meta.url));

afterEach(() => {
  delete process.env.SMITHERS_GH_BIN;
  delete process.env.SMITHERS_FAKE_GH_LOG;
});

describe("runGh", () => {
  test("executes gh in the repo directory, passes stdin, and reports stderr on failure", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-"));
    const log = join(tmp, "gh-log.json");
    // Inject the fake gh by absolute path (PATH lookup irrelevant) and pass the
    // log destination via env, which Bun.spawnSync inherits.
    process.env.SMITHERS_GH_BIN = FAKE_GH;
    process.env.SMITHERS_FAKE_GH_LOG = log;

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      // If the output mismatches, probe the fixture directly (default pipe
      // capture, no temp-file redirect) so a recurrence is fully diagnosable:
      // it distinguishes "spawn never ran the fixture" from "runGh's capture
      // dropped the output", and reports the raw spawn result.
      if (stdout !== "fixture stdout") {
        const logState = existsSync(log)
          ? readFileSync(log, "utf8")
          : "<fixture never ran: no log written>";
        const probe = Bun.spawnSync([FAKE_GH, "api", "ok"], {
          cwd: tmp,
          stdin: new TextEncoder().encode("payload"),
          env: { ...process.env, SMITHERS_FAKE_GH_LOG: log },
        });
        const probeOut = new TextDecoder().decode(probe.stdout ?? new Uint8Array());
        const probeErr = new TextDecoder().decode(probe.stderr ?? new Uint8Array());
        throw new Error(
          `runGh returned ${JSON.stringify(stdout)}; fixture log: ${logState}; ` +
            `fixtureExists=${existsSync(FAKE_GH)}; direct probe: success=${probe.success} ` +
            `exit=${probe.exitCode} signal=${probe.signalCode} ` +
            `stdout=${JSON.stringify(probeOut)} stderr=${JSON.stringify(probeErr)}`,
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
