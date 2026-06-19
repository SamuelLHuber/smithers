import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 *
 * This is a Bun app (`bun ./src/cli/main.ts`, `bun test`). On the Linux CI
 * runner bun dropped the first spawned process's piped stdout — an identical
 * second spawnSync captured it, but the first returned "". Redirect stdout and
 * stderr to temp files (the OS writes the child's fds straight to disk, no pipe
 * buffer to lose) and read them back, which captures reliably on the first call.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const outPath = join(tmpdir(), `smithers-gh-${randomUUID()}.out`);
  const errPath = join(tmpdir(), `smithers-gh-${randomUUID()}.err`);
  try {
    const result = Bun.spawnSync([ghBin, ...args], {
      cwd: repoDir,
      // Pass env explicitly: Bun.spawnSync snapshots the environment at startup
      // for its default, so env vars set at runtime (e.g. a freshly exported
      // GH_TOKEN) would not otherwise reach gh.
      env: { ...process.env },
      stdin: stdin != null ? new TextEncoder().encode(stdin) : undefined,
      stdout: Bun.file(outPath),
      stderr: Bun.file(errPath),
    });
    const stderr = readFileSync(errPath, "utf8");
    // A failed spawn (e.g. the binary could not be exec'd) can surface as
    // success=false; don't silently return "" in that case — report it.
    if (!result.success || result.exitCode !== 0) {
      const detail =
        stderr.trim() ||
        `exited with code ${result.exitCode}${result.signalCode ? `, signal ${result.signalCode}` : ""}`;
      throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${detail}`);
    }
    return readFileSync(outPath, "utf8");
  } finally {
    rmSync(outPath, { force: true });
    rmSync(errPath, { force: true });
  }
}
