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
      stdin: stdin != null ? new TextEncoder().encode(stdin) : undefined,
      stdout: Bun.file(outPath),
      stderr: Bun.file(errPath),
    });
    const stderr = readFileSync(errPath, "utf8");
    if (result.exitCode !== 0) {
      throw new Error(
        `gh ${args.slice(0, 2).join(" ")} failed: ${stderr.trim() || `exited with code ${result.exitCode}`}`,
      );
    }
    return readFileSync(outPath, "utf8");
  } finally {
    rmSync(outPath, { force: true });
    rmSync(errPath, { force: true });
  }
}
