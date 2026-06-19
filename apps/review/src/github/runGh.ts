/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Uses Bun.spawnSync: this is a Bun app (`bun ./src/cli/main.ts`, `bun test`),
 * and on the Linux CI runner neither node:child_process.execFile nor the async
 * Bun.spawn executed the spawned binary or captured its stdout (both returned
 * "" without running it). Bun.spawnSync runs it reliably. gh invocations are
 * short and serialized per review, so the synchronous call is acceptable.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const result = Bun.spawnSync([ghBin, ...args], {
    cwd: repoDir,
    stdin: stdin != null ? new TextEncoder().encode(stdin) : undefined,
  });
  const stdout = result.stdout ? new TextDecoder().decode(result.stdout) : "";
  const stderr = result.stderr ? new TextDecoder().decode(result.stderr) : "";
  if (result.exitCode !== 0) {
    throw new Error(
      `gh ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || `exited with code ${result.exitCode}`}`,
    );
  }
  return stdout;
}
