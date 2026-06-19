/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Uses Bun.spawn rather than node:child_process.execFile: this is a Bun app
 * (`bun ./src/cli/main.ts`), and bun's execFile shim fails to run a spawned
 * binary and capture its stdout on Linux (it returns "" without executing it),
 * which silently dropped every gh result there.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const proc = Bun.spawn([ghBin, ...args], {
    cwd: repoDir,
    stdin: stdin != null ? new TextEncoder().encode(stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(
      `gh ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || `exited with code ${exitCode}`}`,
    );
  }
  return stdout;
}
