import { spawnSync } from "node:child_process";

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * Uses node:child_process.spawnSync rather than Bun.spawnSync. On the Linux CI
 * runner the very first Bun.spawnSync in a process no-ops: it returns
 * success=true / exit 0 with empty output and the child never runs (no side
 * effects), regardless of pipe vs Bun.file capture — a second spawn then works.
 * The standard node:child_process path runs the child reliably on the first
 * call (proven by the direct-spawn probe in tests/github/runGh.test.ts).
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
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
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    const detail =
      stderr.trim() ||
      `exited with code ${result.status}${result.signal ? `, signal ${result.signal}` : ""}`;
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`);
  }
  return result.stdout ?? "";
}
