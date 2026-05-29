import { useCallback, useEffect, useRef, useState } from "react";
import { runsGatewayClient } from "./runsGatewayClient";
import {
  parseApprovals,
  parseRunState,
  parseRunSummaries,
} from "./parseRunPayloads";
import type {
  ApprovalSummary,
  RunStateView,
  RunSummary,
} from "./runState";

export type RunsData = {
  runs: RunSummary[];
  approvals: ApprovalSummary[];
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
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const [runState, setRunState] = useState<RunStateView>();
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string>();
  const runGenerationRef = useRef(0);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const [runsPayload, approvalsPayload] = await Promise.all([
        client.rpc("listRuns", {}),
        client.rpc("listApprovals", {}),
      ]);
      setRuns(parseRunSummaries(runsPayload));
      setApprovals(parseApprovals(approvalsPayload));
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
        const payload = await client.rpc("getRun", { runId });
        if (generation !== runGenerationRef.current) return;
        setRunState(parseRunState(payload));
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
