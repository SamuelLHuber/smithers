import { describe, expect, test } from "bun:test";
import { startDurability } from "../src/startDurability.js";

function fakeAdapter() {
    const states = [];
    const checkpoints = [];
    return {
        states,
        checkpoints,
        async upsertWorkspaceState(row) {
            const i = states.findIndex((s) => s.jjCommitId === row.jjCommitId && s.jjCwd === row.jjCwd);
            if (i >= 0) states[i] = row; else states.push(row);
        },
        async insertWorkspaceCheckpoint(row) { checkpoints.push(row); },
    };
}

function fakeWatcher() {
    let onSettle = () => {};
    let closed = false;
    return {
        create({ onSettle: cb }) { onSettle = cb; return { close() { closed = true; }, watching: true }; },
        settle: () => onSettle(),
        isClosed: () => closed,
    };
}

const baseOpts = (over) => ({
    enabled: true,
    adapter: fakeAdapter(),
    runId: "r1", nodeId: "n1", iteration: 0, attempt: 0,
    cwd: "/wt",
    nowMs: () => 1,
    isJjRepoFn: async () => true,
    captureSnapshot: async () => ({ commitId: "c1", changeId: "ch", operationId: "op1" }),
    ...over,
});

describe("startDurability", () => {
    test("returns a no-op handle when disabled", async () => {
        const adapter = fakeAdapter();
        const h = await startDurability(baseOpts({ enabled: false, adapter }));
        expect(h.active).toBe(false);
        await h.snapshot();
        await h.stop();
        expect(adapter.checkpoints).toHaveLength(0);
    });

    test("returns a no-op handle when the worktree is not a jj repo", async () => {
        const adapter = fakeAdapter();
        const h = await startDurability(baseOpts({ adapter, isJjRepoFn: async () => false }));
        expect(h.active).toBe(false);
        expect(adapter.checkpoints).toHaveLength(0);
    });

    test("returns a no-op handle when there is no worktree", async () => {
        const h = await startDurability(baseOpts({ cwd: undefined }));
        expect(h.active).toBe(false);
    });

    test("a watcher settle records a Tier 2 checkpoint; stop flushes and closes", async () => {
        const adapter = fakeAdapter();
        const watcher = fakeWatcher();
        let n = 0;
        const h = await startDurability(baseOpts({
            adapter,
            createWatcher: watcher.create.bind(watcher),
            captureSnapshot: async () => ({ commitId: `c${++n}`, changeId: "ch", operationId: `op${n}` }),
        }));
        expect(h.active).toBe(true);
        watcher.settle();
        await new Promise((r) => setTimeout(r, 0)); // let the queued snapshot drain
        expect(adapter.checkpoints).toHaveLength(1);
        expect(adapter.checkpoints[0].source).toBe("watch");
        expect(adapter.checkpoints[0].tier).toBe(2);
        await h.stop();
        expect(watcher.isClosed()).toBe(true);
        // The stop flush captured a new state (c2), so a second checkpoint landed.
        expect(adapter.checkpoints).toHaveLength(2);
    });

    test("a capture failure surfaces as a gap, never throwing", async () => {
        const adapter = fakeAdapter();
        const gaps = [];
        const watcher = fakeWatcher();
        const h = await startDurability(baseOpts({
            adapter,
            createWatcher: watcher.create.bind(watcher),
            captureSnapshot: async () => null,
            onGap: (g) => gaps.push(g),
        }));
        watcher.settle();
        await new Promise((r) => setTimeout(r, 0));
        expect(gaps.length).toBeGreaterThanOrEqual(1);
        expect(adapter.checkpoints).toHaveLength(0);
        await h.stop();
    });
});
