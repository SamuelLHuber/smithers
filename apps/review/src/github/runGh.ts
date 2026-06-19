import { spawnSync } from "node:child_process";

/**
 * On the Linux CI runner (and potentially any Bun process) the *first*
 * subprocess spawn no-ops: spawnSync returns status 0 with empty output and the
 * child never runs or produces side effects. The second spawn onward works.
 * Proven across three CI runs and every capture mechanism (Bun.file, pipe,
 * node:child_process) — a direct second spawn of the same binary always ran
 * while the first returned "". A throwaway warm-up spawn absorbs that slot so
 * the first real gh call is reliable, in tests and in production alike.
 */
let warmedUp = false;
function warmUpSpawn(): void {
  if (warmedUp) return;
  warmedUp = true;
  try {
    // `true` exits 0 and ignores stdin; providing input exercises the same
    // stdin-pipe path a real gh call uses.
    spawnSync("true", { input: "", encoding: "utf8" });
  } catch {
    // The warm-up only needs to occupy the first-spawn slot; ignore failures.
  }
}

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  warmUpSpawn();
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
