/** @jsxImportSource smithers-orchestrator */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createSmithers, Gateway } from "smithers-orchestrator";
import { z } from "zod";
import { seedRunStore } from "./seedRunStore";
import {
  LIVE_APPROVAL_RUN,
  LIVE_APPROVAL_RUN_IDS,
  LIVE_CANCEL_RUN,
  LIVE_UI_RUN,
} from "./seededData";

/**
 * Boots a REAL Smithers Gateway (no mocking) for the studio-2 e2e suite.
 *
 * It registers two workflows (each on its OWN SQLite DB so runs never duplicate
 * across adapters), then:
 *   1. SEEDS the inert run rows ({@link seedRunStore}) the list/filter specs
 *      read over the real `listRuns` RPC, and
 *   2. EXECUTES the `studio-approval` workflow with fixed run ids so the
 *      run-detail specs have runs with a REAL populated DevTools tree and a
 *      REAL pending approval gate — the gateway builds node trees from
 *      execution frames, which DB rows alone never produce — plus an
 *      actively-running `studio-long` run for the cancel spec.
 *
 * The Gateway runs under Bun (the orchestrator's SQLite layer uses
 * `bun:sqlite`); vite proxies `/v1/rpc` to this process so the browser reaches
 * it same-origin.
 *
 * Env:
 *   SMITHERS_STUDIO_GATEWAY_PORT — port to listen on (required in CI; default 7400).
 */

const tempDir = mkdtempSync(join(tmpdir(), "studio2-gateway-"));
const dbPath = join(tempDir, "runs.db");
const longDbPath = join(tempDir, "long.db");
const uiDbPath = join(tempDir, "ui.db");
const workflowUiEntry = fileURLToPath(new URL("./workflowUiEntry.ts", import.meta.url));

const { smithers, Workflow, Task, Approval, outputs } = createSmithers(
  {
    plan: z.object({ summary: z.string() }),
    approval: z.object({ approved: z.boolean() }),
  },
  { dbPath },
);

const long = createSmithers({ done: z.object({ ok: z.boolean() }) }, { dbPath: longDbPath });

// A workflow that ships its own custom UI. Registered with a Gateway-served UI
// (`workflowUiEntry.ts`) and executed once so the Runs surface defaults its run
// into the embedded workflow UI. Owns its own DB for the same reason as
// `studio-long`: one run per adapter, no `listRuns` duplication.
const ui = createSmithers({ done: z.object({ ok: z.boolean() }) }, { dbPath: uiDbPath });

// The approval workflow. It is EXECUTED to a real pending approval gate so the
// run-detail flows have a real tree + gate. Its node ids + approval
// title/summary match {@link LIVE_APPROVAL_RUN} so the specs assert on stable
// values. It owns its own DB (`dbPath`), which also holds the DB-seeded runs —
// its adapter returns ALL runs in that DB.
const approvalWorkflow = smithers(() => (
  <Workflow name={LIVE_APPROVAL_RUN.workflowKey}>
    <Task id={LIVE_APPROVAL_RUN.planNodeId} output={outputs.plan}>
      {LIVE_APPROVAL_RUN.planOutput}
    </Task>
    <Approval
      id={LIVE_APPROVAL_RUN.approvalNodeId}
      output={outputs.approval}
      request={{
        title: LIVE_APPROVAL_RUN.approvalTitle,
        summary: LIVE_APPROVAL_RUN.approvalSummary,
      }}
    />
  </Workflow>
));

// The long-running workflow for the cancel spec: a task that never settles on
// its own, so the run stays in the gateway's active set and the real cancelRun
// RPC genuinely cancels it. It runs on its OWN DB so its run never duplicates
// the approval-DB runs across `listRuns` adapters (the gateway lists runs once
// per registered adapter; two workflows on ONE DB would surface every run
// twice, two workflows on SEPARATE DBs keep each run in exactly one adapter).
const longWorkflow = long.smithers(() => (
  <long.Workflow name={LIVE_CANCEL_RUN.workflowKey}>
    <long.Task id={LIVE_CANCEL_RUN.taskNodeId} output={long.outputs.done}>
      {async () => {
        await new Promise((resolve) => setTimeout(resolve, 600_000));
        return { ok: true };
      }}
    </long.Task>
  </long.Workflow>
));

// The UI-bearing workflow: a single task that settles immediately, so the run
// completes and the Runs surface still defaults it into the workflow UI.
const uiWorkflow = ui.smithers(() => (
  <ui.Workflow name={LIVE_UI_RUN.workflowKey}>
    <ui.Task id={LIVE_UI_RUN.taskNodeId} output={ui.outputs.done}>
      {async () => ({ ok: true })}
    </ui.Task>
  </ui.Workflow>
));

// Seed AFTER createSmithers so we control the rows the Gateway will read.
seedRunStore(dbPath);

const gateway = new Gateway({ heartbeatMs: 250 });
gateway.register(LIVE_APPROVAL_RUN.workflowKey, approvalWorkflow);
gateway.register(LIVE_CANCEL_RUN.workflowKey, longWorkflow);
gateway.register(LIVE_UI_RUN.workflowKey, uiWorkflow, { ui: { entry: workflowUiEntry } });

const auth = { triggeredBy: "fixture", scopes: ["*"], role: "operator", tokenId: null };

// Execute the approval workflow for each approval run id, plus the long-running
// workflow for the cancel run. Then wait — BEFORE binding the HTTP listener —
// until ALL approval gates are genuinely pending. Because Playwright treats the
// gateway as ready when `/health` responds, gating before `listen()` guarantees
// no spec runs until the real trees + gates exist (no race). Per-mutation runs
// keep the approve/deny specs isolated so one spec's mutation never clears
// another's gate.
for (const runId of LIVE_APPROVAL_RUN_IDS) {
  await gateway.startRun(LIVE_APPROVAL_RUN.workflowKey, {}, auth, runId, { resume: false });
}
await gateway.startRun(LIVE_CANCEL_RUN.workflowKey, {}, auth, LIVE_CANCEL_RUN.runId, { resume: false });
await gateway.startRun(LIVE_UI_RUN.workflowKey, {}, auth, LIVE_UI_RUN.runId, { resume: false });

const pendingRunIds = new Set<string>(LIVE_APPROVAL_RUN_IDS);
let allGatesReady = false;
for (let attempt = 0; attempt < 480; attempt += 1) {
  const approvals = (await gateway.listPendingApprovals()) as Array<{ runId: string; nodeId: string }>;
  const ready = new Set(
    approvals
      .filter((approval) => approval.nodeId === LIVE_APPROVAL_RUN.approvalNodeId)
      .map((approval) => approval.runId),
  );
  if ([...pendingRunIds].every((runId) => ready.has(runId))) {
    allGatesReady = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!allGatesReady) {
  throw new Error("Not all live approval runs reached a pending approval gate.");
}

const port = Number(process.env.SMITHERS_STUDIO_GATEWAY_PORT ?? "7400");
await gateway.listen({ port, host: "127.0.0.1" });
process.stdout.write(
  `studio-2 e2e gateway listening on http://127.0.0.1:${port} (live gates ready: ${LIVE_APPROVAL_RUN_IDS.join(", ")}; cancel run: ${LIVE_CANCEL_RUN.runId})\n`,
);

async function shutdown() {
  try {
    await gateway.close();
  } catch {
    // ignore
  }
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await new Promise(() => undefined);
