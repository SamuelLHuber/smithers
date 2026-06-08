// Compose the durability snapshot pieces into a start/stop handle the engine can
// drive around a single agent attempt. Returns a no-op handle when disabled, when
// there is no worktree, or when the worktree is not a jj repo (Tier 2 still needs
// jj as the store), so the engine call site stays a couple of lines.
//
// DI seams (isJjRepoFn / captureSnapshot / createWatcher) default to the real jj +
// fs watcher and are overridden in tests.

import { Effect } from "effect";
import * as BunContext from "@effect/platform-bun/BunContext";
import { captureWorkspaceSnapshot, isJjRepo } from "@smithers-orchestrator/vcs/jj";
import { createSnapshotService } from "./snapshotService.js";
import { createWorkspaceWatcher } from "./workspaceWatcher.js";
import { pruneWorkspaceDurability } from "./pruneWorkspaceDurability.js";

/**
 * @template A
 * @param {Effect.Effect<A, never, any>} effect
 * @returns {Promise<A>}
 */
const runVcs = (effect) => Effect.runPromise(effect.pipe(Effect.provide(BunContext.layer)));

const NOOP_HANDLE = {
    active: false,
    /** @returns {Promise<{ skipped: true }>} */
    async snapshot() { return { skipped: true }; },
    async stop() { },
};

/**
 * @typedef {object} StartDurabilityOptions
 * @property {boolean} enabled
 * @property {{ upsertWorkspaceState: Function, insertWorkspaceCheckpoint: Function }} adapter
 * @property {string} runId
 * @property {string} nodeId
 * @property {number} [iteration]
 * @property {number} [attempt]
 * @property {string | undefined} cwd
 * @property {() => number} [nowMs]
 * @property {(gap: { request: unknown, reason: string }) => void} [onGap]
 * @property {(cwd: string) => Promise<boolean>} [isJjRepoFn]
 * @property {(cwd: string) => Promise<{ commitId: string, changeId: string, operationId: string } | null>} [captureSnapshot]
 * @property {(deps: { cwd: string, onSettle: () => void }) => { close: () => void, watching?: boolean }} [createWatcher]
 */

/**
 * @param {StartDurabilityOptions} opts
 * @returns {Promise<{ active: boolean, snapshot: (req?: Record<string, unknown>) => Promise<unknown>, stop: () => Promise<void> }>}
 */
export async function startDurability(opts) {
    const {
        enabled,
        adapter,
        runId,
        nodeId,
        iteration = 0,
        attempt = 0,
        cwd,
        nowMs = () => Date.now(),
        onGap,
        isJjRepoFn = (c) => runVcs(isJjRepo(c)),
        captureSnapshot = (c) => runVcs(captureWorkspaceSnapshot(c)),
        createWatcher = createWorkspaceWatcher,
    } = opts;

    if (!enabled || !cwd) return NOOP_HANDLE;

    let isJj = false;
    try { isJj = await isJjRepoFn(cwd); }
    catch { isJj = false; }
    if (!isJj) return NOOP_HANDLE;

    const service = createSnapshotService({ captureSnapshot, adapter, nowMs, onGap });
    const base = { runId, nodeId, iteration, attempt, cwd };
    /** @param {Record<string, unknown>} req */
    const watchSnapshot = (req) => service.snapshot({ ...base, source: "watch", tier: 2, label: null, toolUseId: null, ...req });
    const watcher = createWatcher({ cwd, onSettle: () => { void watchSnapshot({}); } });

    return {
        active: true,
        // Tier 1 entry point for the in-process tool wrap (Phase 2) and CLI hooks
        // (Phase 3): pass source "wrap"/"hook", tier 1, plus label / toolUseId.
        snapshot: (req = {}) => service.snapshot({ ...base, source: "watch", tier: 2, label: null, toolUseId: null, ...req }),
        async stop() {
            watcher.close();
            // Final flush so the last settled write is captured even if the
            // trailing-idle debounce never fired before the attempt ended.
            await watchSnapshot({});
            // Bound table growth: keep the latest checkpoints/states per scope.
            // Run-scoped + best-effort, so it never affects the run.
            await pruneWorkspaceDurability({ adapter, runId });
        },
    };
}
