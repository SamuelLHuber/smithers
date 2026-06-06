import { create } from "zustand";

export type InspectorView = "tree" | "graph";
export type NodeTab = "Output" | "Logs" | "Diff" | "Props";

export type InspectorSlice = {
  view: InspectorView;
  /** Selected node id; `null` falls back to the run root. */
  selectedId: string | null;
  tab: NodeTab;
  /** Collapsed node ids. */
  collapsed: string[];
};

/** A stable default slice so reads for an untouched run never mint a new object. */
export const INSPECTOR_DEFAULTS: InspectorSlice = {
  view: "tree",
  selectedId: null,
  tab: "Output",
  collapsed: [],
};

type InspectorState = {
  byRun: Record<string, InspectorSlice>;
  setView: (runId: string, view: InspectorView) => void;
  select: (runId: string, nodeId: string) => void;
  setTab: (runId: string, tab: NodeTab) => void;
  toggleCollapsed: (runId: string, nodeId: string) => void;
};

/**
 * Per-run inspector UI on the `ephemeral` medium: the tree/graph view, the
 * selected node, the detail tab, and the collapsed set. Keyed by runId so two
 * open inspectors never share state. These toggles are too transient and too
 * deep to deep-link, so they stay ephemeral instead of going in the URL.
 */
export const useInspectorStore = create<InspectorState>((set) => {
  function patch(runId: string, next: Partial<InspectorSlice>): void {
    set((state) => ({
      byRun: {
        ...state.byRun,
        [runId]: { ...INSPECTOR_DEFAULTS, ...state.byRun[runId], ...next },
      },
    }));
  }
  return {
    byRun: {},
    setView: (runId, view) => patch(runId, { view }),
    select: (runId, selectedId) => patch(runId, { selectedId }),
    setTab: (runId, tab) => patch(runId, { tab }),
    toggleCollapsed: (runId, nodeId) =>
      set((state) => {
        const slice = state.byRun[runId] ?? INSPECTOR_DEFAULTS;
        const collapsed = slice.collapsed.includes(nodeId)
          ? slice.collapsed.filter((id) => id !== nodeId)
          : [...slice.collapsed, nodeId];
        return {
          byRun: {
            ...state.byRun,
            [runId]: { ...INSPECTOR_DEFAULTS, ...slice, collapsed },
          },
        };
      }),
  };
});
