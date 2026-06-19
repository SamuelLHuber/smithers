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
  test("executes gh in the repo directory, passes stdin, and reports stderr on failure", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "smithers-review-gh-"));
    const log = join(tmp, "gh-log.json");
    process.env.SMITHERS_GH_BIN = FAKE_GH;
    process.env.SMITHERS_FAKE_GH_LOG = log;

    try {
      const stdout = await runGh(tmp, ["api", "ok"], "payload");
      if (stdout !== "fixture stdout") {
        const logState = existsSync(log)
          ? readFileSync(log, "utf8")
          : "<fixture never ran: no log written>";
        const probe = spawnSync(process.env.SMITHERS_GH_BIN ?? FAKE_GH, ["api", "ok"], {
          cwd: tmp,
          input: "payload",
          encoding: "utf8",
          env: process.env,
        });
        throw new Error(
          `runGh returned ${JSON.stringify(stdout)}; fixture log: ${logState}; ` +
            `ghBinEnv=${JSON.stringify(process.env.SMITHERS_GH_BIN)} fakeGh=${JSON.stringify(FAKE_GH)} ` +
            `direct probe via env-bin: status=${probe.status} error=${probe.error?.message ?? "none"} ` +
            `stdout=${JSON.stringify(probe.stdout)} stderr=${JSON.stringify(probe.stderr)}`,
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
