import { spawnSync } from "node:child_process";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Works around a Bun subprocess race seen on the Linux CI runner: subprocess
 * spawns issued in an early window after process start silently no-op — spawnSync
 * returns status 0 with empty stdout and the child never runs (no side effects).
 * Proven across CI runs and every spawn mechanism (Bun.spawnSync with pipe or
 * Bun.file, and node:child_process); a later spawn of the same binary always ran.
 * It is timing-based, not a fixed spawn count, so a single warm-up cannot clear
 * it.
 *
 * Retry while the child produces no stdout on a status-0 result. A real gh
 * success prints to stdout, and a real failure exits non-zero (handled
 * immediately below), so the retry only engages on the no-op. Retrying is safe
 * even for mutating gh calls because a no-op child never executed.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const maxAttempts = 12;
  const trace: string[] = [];
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
    trace.push(
      `#${attempt} st=${result.status} sig=${result.signal ?? "·"} ` +
        `outLen=${stdout.length} stderr=${JSON.stringify(stderr.slice(0, 30))}`,
    );
    if (result.status !== 0) {
      const detail =
        stderr.trim() ||
        `exited with code ${result.status}${result.signal ? `, signal ${result.signal}` : ""}`;
      throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`);
    }
    if (stdout !== "") {
      return stdout;
    }
    if (attempt < maxAttempts) {
      await sleep(20 * attempt);
      continue;
    }
  }
  // DIAGNOSTIC: persistent empty stdout — surface ghBin and the per-attempt
  // trace so we can see what runGh's own spawn returns vs a direct spawn.
  throw new Error(
    `gh ${args.slice(0, 2).join(" ")} produced no stdout after ${maxAttempts} attempts; ` +
      `ghBin=${JSON.stringify(ghBin)} cwd=${JSON.stringify(repoDir)} ` +
      `hasStdin=${stdin != null}\n${trace.join("\n")}`,
  );
}
