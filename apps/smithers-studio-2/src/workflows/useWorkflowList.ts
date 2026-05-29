import { useCallback, useEffect, useState } from "react";
import type { WorkflowSegment } from "./WorkflowSegment";
import type { WorkflowEntry } from "./workflowsApi";
import {
  listLocalWorkflows,
  listRemoteWorkflows,
  listPromptWorkflows,
  listScheduleWorkflows,
} from "./workflowsApi";

export type WorkflowListState = {
  entries: WorkflowEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const LOADERS: Record<WorkflowSegment, () => Promise<WorkflowEntry[]>> = {
  local: listLocalWorkflows,
  remote: listRemoteWorkflows,
  prompts: listPromptWorkflows,
  schedules: listScheduleWorkflows,
};

/**
 * Loads the entries for one segment over the workspace HTTP API and reloads when
 * the active segment changes. Errors are surfaced as a single message string so
 * the surface can show an inline error row rather than crashing on a bad payload.
 */
export function useWorkflowList(segment: WorkflowSegment): WorkflowListState {
  const [entries, setEntries] = useState<WorkflowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await LOADERS[segment]();
      setEntries(Array.isArray(next) ? next : []);
    } catch (caught) {
      setEntries([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [segment]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, loading, error, refresh };
}
