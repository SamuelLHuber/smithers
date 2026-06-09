/** @jsxImportSource smithers-orchestrator */
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
let createSmithers;
let Gateway;
let SmithersDb;
/**
 * @param {string} name
 */
function makeDbPath(name) {
    return join(tmpdir(), `smithers-gateway-timers-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}
/**
 * A trivial workflow whose only job is to give the gateway a registered entry
 * (and a DB handle) to sweep. The timer runs are seeded directly so the sweep's
 * decision is what's under test, not the engine's render path.
 * @param {string} dbPath
 */
function createTimerHostWorkflow(dbPath) {
    const api = createSmithers({
        done: z.object({ ok: z.boolean() }),
    }, { dbPath });
    const workflow = api.smithers(() => (<api.Workflow name="gateway-timer-host">
      <api.Task id="noop" output={api.outputs.done}>
        {{ ok: true }}
      </api.Task>
    </api.Workflow>));
    return { workflow, db: api.db };
}
/**
 * Seed a run suspended on a `<Timer>` exactly the way the engine leaves it: run +
 * node in `waiting-timer`, with the fire time recorded on the attempt's metaJson.
 * @param {SmithersDb} adapter
 * @param {string} runId
 * @param {string} workflowName
 * @param {number} firesAtMs
 */
async function seedWaitingTimerRun(adapter, runId, workflowName, firesAtMs) {
    const now = Date.now();
    await adapter.insertRun({
        runId,
        workflowName,
        workflowHash: "timer-hash",
        status: "waiting-timer",
        createdAtMs: now,
    });
    await adapter.insertNode({
        runId,
        nodeId: "cooldown",
        iteration: 0,
        state: "waiting-timer",
        lastAttempt: 1,
        updatedAtMs: now,
        outputTable: "",
        label: "cooldown",
    });
    await adapter.insertAttempt({
        runId,
        nodeId: "cooldown",
        iteration: 0,
        attempt: 1,
        state: "waiting-timer",
        startedAtMs: now,
        finishedAtMs: null,
        errorJson: null,
        metaJson: JSON.stringify({
            timer: {
                timerId: "cooldown",
                timerType: "duration",
                createdAtMs: now,
                firesAtMs,
                firedAtMs: null,
                duration: "1h",
            },
        }),
        responseText: null,
        cached: false,
        jjPointer: null,
        jjCwd: null,
    });
}
describe("Gateway timer sweep", () => {
    let gateway;
    let dbPaths = [];
    beforeAll(async () => {
        createSmithers = (await import("smithers-orchestrator/create")).createSmithers;
        Gateway = (await import("../src/gateway.js")).Gateway;
        SmithersDb = (await import("@smithers-orchestrator/db/adapter")).SmithersDb;
    });
    beforeEach(() => {
        gateway = undefined;
        dbPaths = [];
    });
    afterEach(async () => {
        if (gateway) {
            await gateway.close();
        }
        for (const dbPath of dbPaths) {
            try {
                rmSync(dbPath, { force: true });
                rmSync(`${dbPath}-shm`, { force: true });
                rmSync(`${dbPath}-wal`, { force: true });
            }
            catch { }
        }
        gateway = undefined;
        dbPaths = [];
    });
    test("resumes a waiting-timer run once its fire time has passed", async () => {
        const dbPath = makeDbPath("due");
        dbPaths.push(dbPath);
        const { workflow, db } = createTimerHostWorkflow(dbPath);
        gateway = new Gateway();
        gateway.register("report", workflow);
        const resumed = [];
        gateway.resumeRunIfNeeded = async (runId, workflowKey) => {
            resumed.push({ runId, workflowKey });
        };
        const adapter = new SmithersDb(db);
        await seedWaitingTimerRun(adapter, "due-run", "report", Date.now() - 1_000);
        await gateway.processDueTimers();
        expect(resumed).toEqual([{ runId: "due-run", workflowKey: "report" }]);
    });
    test("leaves a waiting-timer run suspended until its fire time", async () => {
        const dbPath = makeDbPath("pending");
        dbPaths.push(dbPath);
        const { workflow, db } = createTimerHostWorkflow(dbPath);
        gateway = new Gateway();
        gateway.register("report", workflow);
        const resumed = [];
        gateway.resumeRunIfNeeded = async (runId, workflowKey) => {
            resumed.push({ runId, workflowKey });
        };
        const adapter = new SmithersDb(db);
        await seedWaitingTimerRun(adapter, "pending-run", "report", Date.now() + 3_600_000);
        await gateway.processDueTimers();
        expect(resumed).toEqual([]);
    });
    test("skips a run that is already being driven", async () => {
        const dbPath = makeDbPath("active");
        dbPaths.push(dbPath);
        const { workflow, db } = createTimerHostWorkflow(dbPath);
        gateway = new Gateway();
        gateway.register("report", workflow);
        const resumed = [];
        gateway.resumeRunIfNeeded = async (runId, workflowKey) => {
            resumed.push({ runId, workflowKey });
        };
        const adapter = new SmithersDb(db);
        await seedWaitingTimerRun(adapter, "active-run", "report", Date.now() - 1_000);
        gateway.activeRuns.set("active-run", { abort: { abort() { } } });
        await gateway.processDueTimers();
        expect(resumed).toEqual([]);
    });
});
