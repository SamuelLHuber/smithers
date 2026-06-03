import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Construct smoke for the REAL ultragrill workflow (and, through it, the
 * VerifiableGoals + ShipTickets components it composes).
 *
 * `smithers graph` renders the workflow's JSX into its node graph WITHOUT
 * executing it (no agents, no git worktrees), so it's a fast, deterministic
 * check that the real `.tsx` imports, its schemas are valid, and every node the
 * monitoring UI depends on actually exists — catching any drift between the
 * workflow's node-id contract and the UI that reads it.
 *
 * Invoked as `bun run apps/cli/src/index.js graph …` (the CLI entry directly),
 * which bypasses the `smithers` shell-wrapper bin. A seeded tickets dir makes
 * ShipTickets render its per-ticket pipeline (it discovers the queue from disk).
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const cliEntry = resolve(repoRoot, "apps/cli/src/index.js");
const ultragrill = resolve(here, "../workflows/ultragrill.tsx");

function graph(workflow: string, input?: Record<string, unknown>): { code: number; out: string } {
  const args = ["run", cliEntry, "graph", workflow, "--format", "json"];
  if (input) args.push("--input", JSON.stringify(input));
  const r = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

test("ultragrill workflow renders the goals + per-ticket ship contract", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ultragrill-graph-"));
  try {
    writeFileSync(join(tmp, "0001-sample.md"), "---\ntitle: Sample Goal\n---\n# Sample Goal\nBody.\n");
    const { code, out } = graph(ultragrill, { ticketsDir: tmp });
    expect(code).toBe(0);
    // VerifiableGoals: the proposal-decomposition stage.
    for (const nodeId of ["goals", "write"]) {
      expect(out).toContain(`"${nodeId}"`);
    }
    // ShipTickets: the manifest + every per-ticket node id the UI's STAGES read.
    for (const nodeId of [
      "manifest",
      "0001-sample:research",
      "0001-sample:plan",
      "0001-sample:implement",
      "0001-sample:validate",
      "0001-sample:review:0",
      "0001-sample:merge",
    ]) {
      expect(out).toContain(`"${nodeId}"`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}, 130_000);
