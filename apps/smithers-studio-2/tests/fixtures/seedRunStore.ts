import { Database } from "bun:sqlite";
import {
  SEEDED_APPROVALS,
  SEEDED_NODES,
  SEEDED_RUNS,
} from "./seededData";

/**
 * Seed the Gateway's SQLite run store with the deterministic runs, nodes, and
 * approvals from {@link ./seededData}. The schema mirrors the real
 * `@smithers-orchestrator/db` table definitions exactly, so the live Gateway's
 * `listRuns` / `listApprovals` / `getRun` RPCs read these rows verbatim — the
 * UI then renders them over the real `/v1/rpc` path with no mocking.
 *
 * Must run under Bun (uses `bun:sqlite`), like the Gateway fixture itself.
 */
export function seedRunStore(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS _smithers_runs (
        run_id TEXT PRIMARY KEY,
        parent_run_id TEXT,
        workflow_name TEXT NOT NULL,
        workflow_path TEXT,
        workflow_hash TEXT,
        status TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        started_at_ms INTEGER,
        finished_at_ms INTEGER,
        heartbeat_at_ms INTEGER,
        runtime_owner_id TEXT,
        cancel_requested_at_ms INTEGER,
        hijack_requested_at_ms INTEGER,
        hijack_target TEXT,
        vcs_type TEXT,
        vcs_root TEXT,
        vcs_revision TEXT,
        error_json TEXT,
        config_json TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS _smithers_nodes (
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL,
        last_attempt INTEGER,
        updated_at_ms INTEGER NOT NULL,
        output_table TEXT NOT NULL,
        label TEXT,
        PRIMARY KEY (run_id, node_id, iteration)
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS _smithers_approvals (
        run_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        requested_at_ms INTEGER,
        decided_at_ms INTEGER,
        note TEXT,
        decided_by TEXT,
        request_json TEXT,
        decision_json TEXT,
        auto_approved INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (run_id, node_id, iteration)
      )
    `);

    const insertRun = db.query(`
      INSERT OR REPLACE INTO _smithers_runs
        (run_id, workflow_name, status, created_at_ms, started_at_ms, finished_at_ms, heartbeat_at_ms, error_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const run of SEEDED_RUNS) {
      insertRun.run(
        run.runId,
        run.workflowName,
        run.status,
        run.createdAtMs,
        run.startedAtMs,
        run.finishedAtMs,
        run.heartbeatAtMs,
        run.errorJson,
      );
    }

    const insertNode = db.query(`
      INSERT OR REPLACE INTO _smithers_nodes
        (run_id, node_id, iteration, state, updated_at_ms, output_table, label)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const node of SEEDED_NODES) {
      insertNode.run(
        node.runId,
        node.nodeId,
        node.iteration,
        node.state,
        node.runId === "run-approve-waiting" ? 1 : 1,
        node.outputTable,
        node.label,
      );
    }

    const insertApproval = db.query(`
      INSERT OR REPLACE INTO _smithers_approvals
        (run_id, node_id, iteration, status, requested_at_ms, request_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const approval of SEEDED_APPROVALS) {
      insertApproval.run(
        approval.runId,
        approval.nodeId,
        approval.iteration,
        approval.status,
        approval.requestedAtMs,
        approval.requestJson,
      );
    }
  } finally {
    db.close();
  }
}
