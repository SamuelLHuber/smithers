import { useCallback, useEffect, useRef, useState } from "react";
import { parseDevToolsSnapshot } from "../devtools/parseDevToolsSnapshot";
import { useWorkflowLaunchHandoff } from "../workflows/workflowLaunchHandoff";
import { runsGatewayClient } from "./runsGatewayClient";
import {
  parseApprovals,
  parseRunState,
  parseRunSummaries,
  parseWorkflowUiPaths,
} from "./parseRunPayloads";
import { snapshotToRunTree } from "./snapshotToRunTree";
import {
  isTerminalState,
  type ApprovalSummary,
  type RunStateView,
  type RunSummary,
} from "./runState";

/** How often to poll a live (non-terminal) run's state + tree, in ms. */
const LIVE_POLL_MS = 2000;

export type RunsData = {
  runs: RunSummary[];
  approvals: ApprovalSummary[];
  /** workflowKey → mounted custom-UI path, for workflows that ship their own UI. */
  workflowUiPaths: Record<string, string>;
  selectedRunId: string | undefined;
  runState: RunStateView | undefined;
  loadingList: boolean;
  loadingRun: boolean;
  error: string | undefined;
  selectRun: (runId: string | undefined) => void;
  refresh: () => void;
  refreshRun: () => void;
};

/**
 * The Runs data layer: lists runs + approvals on mount, loads the selected
 * run's state, and re-exposes refresh hooks the action layer calls after a
 * mutation. All reads go through the Gateway client's HTTP RPC, so the e2e
 * suite drives the real code path by intercepting `/v1/rpc/*`.
 */
export function useRunsData(): RunsData {
  const client = runsGatewayClient();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [approvals, setApprovals] = useState<ApprovalSummary[]>([]);
  const [workflowUiPaths, setWorkflowUiPaths] = useState<Record<string, string>>({});
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [runState, setRunState] = useState<RunStateView>();
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string>();
  const runGenerationRef = useRef(0);
  // The latest approvals, read inside loadRun without re-binding the callback,
  // so the merged tree marks pending-approval nodes consistently with the list.
  const approvalsRef = useRef<ApprovalSummary[]>([]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      // listWorkflows is the source of truth for which workflows ship a custom
      // UI; it's resolved alongside the run/approval lists but tolerated as
      // optional — an older gateway without it just means no run defaults to a
      // workflow UI.
      const [runsPayload, approvalsPayload, workflowsPayload] = await Promise.all([
        client.rpc("listRuns", {}),
        client.rpc("listApprovals", {}),
        client.rpc("listWorkflows", {}).catch(() => []),
      ]);
      const parsedApprovals = parseApprovals(approvalsPayload);
      approvalsRef.current = parsedApprovals;
      setRuns(parseRunSummaries(runsPayload));
      setApprovals(parsedApprovals);
      setWorkflowUiPaths(parseWorkflowUiPaths(workflowsPayload));
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoadingList(false);
    }
  }, [client]);

  const loadRun = useCallback(
    async (runId: string | undefined) => {
      if (!runId) {
        setRunState(undefined);
        return;
      }
      const generation = ++runGenerationRef.current;
      setLoadingRun(true);
      try {
        // The run-level state comes from getRun; the live node TREE comes from
        // the separate getDevToolsSnapshot RPC (getRun carries no tree). Fetch
        // both and merge the snapshot tree into the run-level view.
        const [runPayload, snapshotResult] = await Promise.all([
          client.rpc("getRun", { runId }),
          client.rpc("getDevToolsSnapshot", { runId }).then(
            (payload) => parseDevToolsSnapshot(payload),
            () => null,
          ),
        ]);
        if (generation !== runGenerationRef.current) return;
        const runStateView = parseRunState(runPayload);
        const pendingApprovalNodeIds = new Set(
          approvalsRef.current
            .filter((approval) => approval.runId === runId)
            .map((approval) => approval.nodeId),
        );
        runStateView.tree = snapshotToRunTree(snapshotResult, pendingApprovalNodeIds);
        // The snapshot's frameNo is the latest committed frame number; frames
        // commit sequentially from 1, so it doubles as the frame count and the
        // current cursor. This is what makes the Rewind button render once a run
        // has advanced past its first frame (frameCount > 1). getRun itself
        // carries no frame ledger, so this is the only honest frame source.
        if (snapshotResult && snapshotResult.frameNo > 0) {
          runStateView.currentFrame = snapshotResult.frameNo;
          runStateView.frameCount = snapshotResult.frameNo;
        }
        setRunState(runStateView);
        setError(undefined);
      } catch (cause) {
        if (generation !== runGenerationRef.current) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setRunState(undefined);
      } finally {
        if (generation === runGenerationRef.current) setLoadingRun(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Auto-select the first run once the list lands and nothing is selected yet.
  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      setSelectedRunId(runs[0].runId);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    void loadRun(selectedRunId);
  }, [selectedRunId, loadRun]);

  // Consume the Workflows -> Runs launch handoff: when a freshly launched run
  // id appears, select it once and clear the handoff so a later manual
  // selection isn't clobbered by a stale pending id.
  const pendingRunId = useWorkflowLaunchHandoff((s) => s.pendingRunId);
  const clearPendingRun = useWorkflowLaunchHandoff((s) => s.clearPendingRun);
  useEffect(() => {
    if (!pendingRunId) return;
    setSelectedRunId(pendingRunId);
    clearPendingRun();
  }, [pendingRunId, clearPendingRun]);

  // Keep a live (non-terminal) run fresh without re-selecting it: poll getRun +
  // getDevToolsSnapshot AND the run/approval lists on an interval so new
  // approvals, state transitions, tree growth, and completion appear on their
  // own. Polling stops as soon as the run reaches a terminal state.
  const isLive = runState ? !isTerminalState(runState.state) : false;
  useEffect(() => {
    if (!selectedRunId || !isLive) return;
    const id = setInterval(() => {
      void loadList();
      void loadRun(selectedRunId);
    }, LIVE_POLL_MS);
    return () => clearInterval(id);
  }, [selectedRunId, isLive, loadList, loadRun]);

  const selectRun = useCallback((runId: string | undefined) => {
    setSelectedRunId(runId);
  }, []);

  const refresh = useCallback(() => {
    void loadList();
  }, [loadList]);

  const refreshRun = useCallback(() => {
    void loadRun(selectedRunId);
  }, [loadRun, selectedRunId]);

  return {
    runs,
    approvals,
    workflowUiPaths,
    selectedRunId,
    runState,
    loadingList,
    loadingRun,
    error,
    selectRun,
    refresh,
    refreshRun,
  };
}
