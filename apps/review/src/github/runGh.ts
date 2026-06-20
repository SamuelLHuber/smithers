import { spawnSync } from "node:child_process";

/**
 * Run the gh CLI in a repo directory; resolves stdout, throws with stderr.
 */
export async function runGh(repoDir: string, args: string[], stdin?: string): Promise<string> {
  // Honor an explicit gh path (non-standard installs, and hermetic tests that
  // inject a fake gh by absolute path).
  const ghBin = process.env.SMITHERS_GH_BIN || "gh";
  const result = spawnSync(ghBin, args, {
    cwd: repoDir,
    input: stdin ?? undefined,
    encoding: "utf8",
    // Pass env explicitly so env vars set at runtime (e.g. a freshly exported
    // GH_TOKEN) reach gh; the default snapshot would miss them.
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
