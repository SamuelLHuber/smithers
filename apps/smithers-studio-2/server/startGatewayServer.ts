import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createSmithers, Gateway } from "smithers-orchestrator";
import { jsx } from "smithers-orchestrator/jsx-runtime";

/**
 * Boot the REAL Smithers Gateway for the studio dev stack.
 *
 * Entry point invoked by `scripts/dev.ts` (and runnable standalone). Binds to
 * `SMITHERS_STUDIO_GATEWAY_PORT` (default 7331) on 127.0.0.1 and serves the real
 * Gateway HTTP surface: `/health`, the JSON-RPC endpoint at `/rpc` + `/v1/rpc/*`,
 * and the workflow-UI mounts. It is the production-shaped sibling of
 * `server/startWorkspaceApiServer.ts`.
 *
 * IT SEEDS NOTHING. Unlike the e2e fixture (`tests/fixtures/gatewayFixture.tsx`,
 * which inline-defines demo workflows and executes seeded `studio-*` runs so the
 * Playwright specs have deterministic trees + gates), this server binds a single
 * Gateway adapter directly to the workspace database and surfaces whatever REAL
 * runs already live there. `listRuns` reads `_smithers_runs` DB-wide, so every
 * real run recorded by `smithers up` / the workflows in this workspace shows up
 * with its own `workflowName`/`workflowPath` — no demo rows, no execution on boot.
 *
 * Why a single workspace-scoped adapter (and not one register() per discovered
 * `.smithers/workflows/*.tsx`):
 *   - Every discovered workflow defaults to the SAME `./smithers.db`
 *     (`createSmithers`'s default `dbPath`), so the Gateway's
 *     `listRunsAcrossWorkflows` — which iterates one adapter per registered key
 *     and concatenates each adapter's full `listRuns` — would surface every run
 *     once per registered workflow (N registrations over one DB ⇒ N× duplicate
 *     run rows). One adapter over the workspace DB lists each real run exactly
 *     once.
 *   - Importing the real workflow modules requires `process.chdir(workspace)` so
 *     their cwd-relative `./smithers.db` resolves to the workspace DB. Under Bun,
 *     resolving the workspace root's module graph (the orchestrator's JSX runtime
 *     plus the hundreds of per-worktree React copies under
 *     `.smithers/workflows/.worktrees/*`) corrupts Bun's module resolver
 *     (`EISDIR ... react@.../index.js` with garbled cache paths) and aborts boot.
 *     Binding the adapter to an ABSOLUTE workspace DB path keeps the gateway
 *     bootable from the studio app dir while still reading the real workspace DB.
 *
 * The Gateway runs under Bun (the orchestrator's SQLite layer uses `bun:sqlite`);
 * vite proxies `/rpc` + `/v1/rpc` to this process so the browser reaches it
 * same-origin.
 *
 * Env:
 *   SMITHERS_STUDIO_GATEWAY_PORT — port to listen on (default 7331).
 *   SMITHERS_STUDIO_GATEWAY_HOST — host to bind (default 127.0.0.1).
 *   SMITHERS_STUDIO_WORKSPACE    — workspace dir holding the real .smithers +
 *                                  smithers.db (default: process cwd).
 */
const port = Number(process.env.SMITHERS_STUDIO_GATEWAY_PORT ?? "7331");
const host = process.env.SMITHERS_STUDIO_GATEWAY_HOST ?? "127.0.0.1";
const workspace = resolve(process.env.SMITHERS_STUDIO_WORKSPACE ?? process.cwd());

const dbPath = resolve(workspace, "smithers.db");
if (!existsSync(dbPath)) {
  throw new Error(
    `No workspace database at ${dbPath}. Run a workflow (e.g. \`smithers up\`) in ${workspace} first, ` +
      `or set SMITHERS_STUDIO_WORKSPACE to a workspace that has a real .smithers + smithers.db.`,
  );
}

// A single, schemaless workflow whose adapter is bound to the REAL workspace DB.
// It registers no tasks and is never executed here — its only job is to give the
// Gateway one adapter over `smithers.db` so `listRuns`/snapshots/approvals serve
// the workspace's real runs. The explicit absolute `dbPath` makes the binding
// independent of `process.cwd()`. The Workflow element is built via the
// orchestrator's JSX runtime (`jsx(...)`) so this entry stays a plain `.ts` file.
const { smithers, Workflow } = createSmithers({}, { dbPath });
const workspaceWorkflow = smithers(() => jsx(Workflow, { name: "workspace" }));

const gateway = new Gateway({ heartbeatMs: 15_000 });
gateway.register("workspace", workspaceWorkflow);

await gateway.listen({ port, host });
process.stdout.write(`studio-2 gateway server listening on http://${host}:${port} (workspace ${workspace})\n`);

async function shutdown(): Promise<void> {
  try {
    await gateway.close();
  } catch {
    // best-effort close on shutdown
  }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
