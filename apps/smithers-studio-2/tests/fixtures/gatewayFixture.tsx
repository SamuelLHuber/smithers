/** @jsxImportSource smithers-orchestrator */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSmithers, Gateway } from "smithers-orchestrator";
import { z } from "zod";
import { seedRunStore } from "./seedRunStore";

/**
 * Boots a REAL Smithers Gateway (no mocking) for the studio-2 e2e suite.
 *
 * It registers a single workflow backed by a shared SQLite store, seeds that
 * store with the deterministic runs/nodes/approvals from `./seededData`, and
 * serves the live `POST /v1/rpc/<method>` contract the Runs + Developer
 * surfaces speak. The Gateway runs under Bun (the orchestrator's SQLite layer
 * uses `bun:sqlite`); vite proxies `/v1/rpc` to this process so the browser
 * reaches it same-origin.
 *
 * Env:
 *   SMITHERS_STUDIO_GATEWAY_PORT — port to listen on (required in CI; default 7400).
 */

const tempDir = mkdtempSync(join(tmpdir(), "studio2-gateway-"));
const dbPath = join(tempDir, "runs.db");

// A real workflow so the Gateway has something registered to resolve adapters
// against. Its schema is irrelevant to the seeded reads — registration is what
// gives `listRunsAcrossWorkflows` an adapter pointed at our shared DB.
const { smithers, Workflow, Task, outputs } = createSmithers(
  { result: z.object({ ok: z.boolean() }) },
  { dbPath },
);

const workflow = smithers(() => (
  <Workflow name="studio-deploy">
    <Task id="echo" output={outputs.result}>
      {{ ok: true }}
    </Task>
  </Workflow>
));

// Seed AFTER createSmithers so we control the rows the Gateway will read.
seedRunStore(dbPath);

const gateway = new Gateway({ heartbeatMs: 250 });
gateway.register("studio-deploy", workflow);

const port = Number(process.env.SMITHERS_STUDIO_GATEWAY_PORT ?? "7400");
await gateway.listen({ port, host: "127.0.0.1" });
process.stdout.write(`studio-2 e2e gateway listening on http://127.0.0.1:${port}\n`);

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
