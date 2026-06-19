import { spawnSync } from "node:child_process";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Works around a Bun subprocess race seen on the Linux CI runner: subprocess
 * spawns issued in an early window after process start silently no-op — spawnSync
 * returns status 0 with empty stdout/stderr and the child never runs (no side
 * effects at all). Proven across CI runs and every spawn mechanism (Bun.spawnSync
 * with pipe or Bun.file, and node:child_process); a later spawn of the same
 * binary always ran. It is timing-based, not a fixed spawn count, so a single
 * warm-up does not clear it.
 *
 * Detect the no-op (status 0 with no output — a real gh success prints output, a
 * real failure prints stderr) and retry with small increasing backoff. Retrying
 * is safe because a no-op child never executed, so nothing was applied even for
 * mutating gh calls.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync(ghBin, args, {
      cwd: repoDir,
      input: stdin ?? undefined,
      encoding: "utf8",
      // env defaults to process.env (read at call time), which carries runtime
      // env changes; pass it explicitly to be unambiguous.
      env: process.env,
    });
    if (result.error) {
      throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${result.error.message}`);
    }
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (result.status === 0 && stdout === "" && stderr === "" && attempt < maxAttempts) {
      await sleep(20 * attempt);
      continue;
    }
    if (result.status !== 0) {
      const detail =
        stderr.trim() ||
        `exited with code ${result.status}${result.signal ? `, signal ${result.signal}` : ""}`;
      throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`);
    }
    return stdout;
  }
  return "";
}
