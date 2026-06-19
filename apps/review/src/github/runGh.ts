/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Uses Bun.spawnSync with default pipe capture. An earlier version redirected
 * stdout/stderr to temp files via Bun.file() to work around a CI flake, but on
 * the Linux runner opening that output file could fail and leave the child
 * effectively unrun — Bun.spawnSync returned success=true, exit=0, empty output,
 * and the child produced no side effects at all. Pipe capture runs the child
 * reliably (proven by the direct-spawn probe in tests/github/runGh.test.ts).
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const result = Bun.spawnSync([ghBin, ...args], {
    cwd: repoDir,
    // Pass env explicitly: Bun.spawnSync snapshots the environment at startup
    // for its default, so env vars set at runtime (e.g. a freshly exported
    // GH_TOKEN) would not otherwise reach gh.
    env: { ...process.env },
    stdin: stdin != null ? new TextEncoder().encode(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = new TextDecoder().decode(result.stderr ?? new Uint8Array());
  // A failed spawn (e.g. the binary could not be exec'd) can surface as
  // success=false; don't silently return "" in that case — report it.
  if (!result.success || result.exitCode !== 0) {
    const detail =
      stderr.trim() ||
      `exited with code ${result.exitCode}${result.signalCode ? `, signal ${result.signalCode}` : ""}`;
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`);
  }
  return new TextDecoder().decode(result.stdout ?? new Uint8Array());
}
