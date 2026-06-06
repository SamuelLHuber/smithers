import { create } from "zustand";
import type { NodeStatus, RunNode } from "../runs/Run";
import { gatewayRpc } from "./gatewayRpc";
import type { GatewayRun, GatewayStatus, GatewayWorkflow } from "./gatewayTypes";
import { snapshotToRunNode } from "./snapshotToRunNode";
import { toNodeStatus } from "./toNodeStatus";

/** The resolved, render-ready view of one gateway run. */
type RunView = {
  workflowKey: string;
  status: NodeStatus;
  /** The node tree from the DevTools snapshot; null until loaded or for an empty run. */
  tree: RunNode | null;
  loaded: boolean;
};

type GatewayState = {
  status: GatewayStatus;
  /** Workflows that ship a custom UI (the only ones this app can embed). */
  workflows: GatewayWorkflow[];
  runs: GatewayRun[];
  selectedRunId: string | undefined;
  runViews: Record<string, RunView>;
  /** Node output rows, keyed `${runId}::${nodeId}`. `null` once fetched-but-empty. */
  outputs: Record<string, unknown>;

  /** Lazily connect if we have not yet (or a previous attempt went offline). */
  ensureConnected: () => void;
  connect: () => Promise<void>;
  reset: () => void;
  refreshRuns: () => Promise<void>;
  /** Select a run and begin (re)loading its snapshot; polls until terminal. */
  openRun: (workflowKey: string, runId: string) => void;
  closeRun: () => void;
  refreshSnapshot: (runId: string) => Promise<void>;
  fetchOutput: (runId: string, nodeId: string) => Promise<void>;
  launch: (workflowKey: string) => Promise<string | undefined>;
  uiPathFor: (workflowKey: string) => string | undefined;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** Keep only workflows that actually mount a UI (`hasUi` + a non-empty `uiPath`). */
function parseWorkflows(payload: unknown): GatewayWorkflow[] {
  if (!Array.isArray(payload)) return [];
  const out: GatewayWorkflow[] = [];
  for (const raw of payload) {
    const record = asRecord(raw);
    const key = asString(record.key);
    const uiPath = asString(record.uiPath);
    if (key && record.hasUi === true && uiPath) {
      out.push({
        key,
        readableName: asString(record.readableName) || key,
        description: asString(record.description),
        uiPath,
      });
    }
  }
  return out;
}

function parseRuns(payload: unknown): GatewayRun[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((raw) => {
      const record = asRecord(raw);
      return {
        runId: asString(record.runId),
        workflowKey: asString(record.workflowKey),
        status: toNodeStatus(asString(record.status)),
        createdAtMs: asNumber(record.createdAtMs),
      } satisfies GatewayRun;
    })
    .filter((run) => run.runId.length > 0);
}

function isTerminal(status: NodeStatus): boolean {
  return status === "ok" || status === "failed";
}

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /^(UNAUTHORIZED|Unauthorized|FORBIDDEN|Forbidden)\b/.test(message)
    || /\bGateway HTTP (401|403)\b/.test(message);
}

const POLL_MS = 3000;

// Module-level timers, mirroring runsStore: live for the page, never an effect.
let runsPoll: ReturnType<typeof setInterval> | undefined;
let snapshotPoll: ReturnType<typeof setInterval> | undefined;

export const useGatewayStore = create<GatewayState>((set, get) => {
  function stopRunsPoll(): void {
    if (runsPoll) {
      clearInterval(runsPoll);
      runsPoll = undefined;
    }
  }
  function stopSnapshotPoll(): void {
    if (snapshotPoll) {
      clearInterval(snapshotPoll);
      snapshotPoll = undefined;
    }
  }

  return {
    status: "idle",
    workflows: [],
    runs: [],
    selectedRunId: undefined,
    runViews: {},
    outputs: {},

    ensureConnected: () => {
      const status = get().status;
      if (status === "idle" || status === "offline" || status === "unauthorized") {
        void get().connect();
      }
    },

    connect: async () => {
      if (get().status === "connecting" || get().status === "online") return;
      set({ status: "connecting" });
      try {
        const [workflows, runs] = await Promise.all([
          gatewayRpc("listWorkflows", { filter: { hasUi: true } }),
          gatewayRpc("listRuns", {}),
        ]);
        set({
          status: "online",
          workflows: parseWorkflows(workflows),
          runs: parseRuns(runs),
        });
        stopRunsPoll();
        if (typeof window !== "undefined") {
          runsPoll = setInterval(() => void get().refreshRuns(), POLL_MS);
        }
      } catch (error) {
        set({
          status: isAuthError(error) ? "unauthorized" : "offline",
          workflows: isAuthError(error) ? [] : get().workflows,
          runs: isAuthError(error) ? [] : get().runs,
        });
        stopRunsPoll();
      }
    },

    reset: () => {
      stopRunsPoll();
      stopSnapshotPoll();
      set({
        status: "idle",
        workflows: [],
        runs: [],
        selectedRunId: undefined,
        runViews: {},
        outputs: {},
      });
    },

    refreshRuns: async () => {
      try {
        const runs = await gatewayRpc("listRuns", {});
        set({ runs: parseRuns(runs), status: "online" });
      } catch (error) {
        set({
          status: isAuthError(error) ? "unauthorized" : "offline",
          runs: isAuthError(error) ? [] : get().runs,
        });
        stopRunsPoll();
      }
    },

    openRun: (workflowKey, runId) => {
      get().ensureConnected();
      stopSnapshotPoll();
      set((state) => ({
        selectedRunId: runId,
        runViews: {
          ...state.runViews,
          [runId]: state.runViews[runId] ?? {
            workflowKey,
            status: "queued",
            tree: null,
            loaded: false,
          },
        },
      }));
      void get().refreshSnapshot(runId);
      if (typeof window !== "undefined") {
        snapshotPoll = setInterval(() => {
          if (get().selectedRunId !== runId) {
            stopSnapshotPoll();
            return;
          }
          const view = get().runViews[runId];
          if (view?.loaded && isTerminal(view.status)) {
            stopSnapshotPoll();
            return;
          }
          void get().refreshSnapshot(runId);
        }, POLL_MS);
      }
    },

    closeRun: () => {
      stopSnapshotPoll();
      set({ selectedRunId: undefined });
    },

    refreshSnapshot: async (runId) => {
      try {
        const snapshot = await gatewayRpc("getDevToolsSnapshot", { runId });
        const state = asString(asRecord(asRecord(snapshot).runState).state);
        set((store) => ({
          status: "online",
          runViews: {
            ...store.runViews,
            [runId]: {
              workflowKey: store.runViews[runId]?.workflowKey ?? "",
              status: toNodeStatus(state),
              tree: snapshotToRunNode(snapshot as never),
              loaded: true,
            },
          },
        }));
      } catch (error) {
        if (isAuthError(error)) {
          set({ status: "unauthorized" });
        }
        // Leave the prior view in place; connection state is owned by refreshRuns.
      }
    },

    fetchOutput: async (runId, nodeId) => {
      const key = `${runId}::${nodeId}`;
      if (key in get().outputs) return;
      try {
        const payload = await gatewayRpc("getNodeOutput", {
          runId,
          nodeId,
          iteration: 0,
        });
        const record = asRecord(payload);
        const row = "row" in record ? record.row : payload;
        set((store) => ({ outputs: { ...store.outputs, [key]: row ?? null } }));
      } catch (error) {
        if (isAuthError(error)) {
          set({ status: "unauthorized" });
        }
        set((store) => ({ outputs: { ...store.outputs, [key]: null } }));
      }
    },

    launch: async (workflowKey) => {
      try {
        const payload = await gatewayRpc("launchRun", { workflowKey, input: {} });
        const runId = asString(asRecord(payload).runId);
        void get().refreshRuns();
        return runId || undefined;
      } catch (error) {
        if (isAuthError(error)) {
          set({ status: "unauthorized" });
        }
        return undefined;
      }
    },

    uiPathFor: (workflowKey) =>
      get().workflows.find((workflow) => workflow.key === workflowKey)?.uiPath,
  };
});
