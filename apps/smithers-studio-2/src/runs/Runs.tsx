import "./runs.css";
import { useEffect, useMemo, useState } from "react";
import { LiveRunLayout } from "./LiveRunLayout";
import { RunHistoryList } from "./RunHistoryList";
import { RunInspector } from "./RunInspector";
import { RunToolbar } from "./RunToolbar";
import { RunTree } from "./RunTree";
import { findNode } from "./findNode";
import { useRunEvents } from "./useRunEvents";
import { useRunsBadgeStore } from "./runsBadgeStore";
import { useRunsData } from "./useRunsData";

/**
 * The Runs surface — the heart of the ops console. A run-history rail (with an
 * approvals filter) on the left; the responsive live-run layout (tree pane +
 * inspector) on the right. Approvals are surfaced three ways: a list filter, an
 * inline gate in the inspector, and the nav badge count (runsBadgeStore).
 */
export function Runs() {
  const data = useRunsData();
  const events = useRunEvents(data.selectedRunId);
  const setPendingApprovals = useRunsBadgeStore((s) => s.setPendingApprovals);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keep the nav badge in sync with the live pending-approval count.
  useEffect(() => {
    setPendingApprovals(data.approvals.length);
  }, [data.approvals.length, setPendingApprovals]);

  // Reset node selection when the run changes; default to the run root.
  useEffect(() => {
    setSelectedNodeId(data.runState?.tree?.id);
    setSheetOpen(false);
  }, [data.runState?.runId, data.runState?.tree?.id]);

  const selectedNode = useMemo(
    () => findNode(data.runState?.tree ?? null, selectedNodeId),
    [data.runState, selectedNodeId],
  );

  const nodeApproval = useMemo(
    () =>
      data.approvals.find(
        (approval) =>
          approval.runId === data.selectedRunId && approval.nodeId === selectedNodeId,
      ),
    [data.approvals, data.selectedRunId, selectedNodeId],
  );

  const onSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSheetOpen(true);
  };

  const onApprovalResolved = () => {
    data.refresh();
    data.refreshRun();
  };

  return (
    <section className="runs-surface" data-testid="view.runs">
      <header className="runs-header">
        <h2 className="runs-title">Runs</h2>
        {data.error ? <span className="runs-header-error">{data.error}</span> : null}
      </header>

      <div className="runs-body">
        <aside className="runs-rail">
          <RunHistoryList
            runs={data.runs}
            approvals={data.approvals}
            selectedRunId={data.selectedRunId}
            onSelectRun={data.selectRun}
          />
        </aside>

        <div className="runs-main">
          {data.selectedRunId && data.runState ? (
            <>
              <RunToolbar
                run={data.runState}
                streaming={events.streaming}
                onChanged={() => {
                  data.refresh();
                  data.refreshRun();
                }}
              />
              <LiveRunLayout
                hasSelection={Boolean(selectedNode)}
                sheetOpen={sheetOpen}
                onCloseSheet={() => setSheetOpen(false)}
                tree={
                  <RunTree
                    tree={data.runState.tree}
                    selectedNodeId={selectedNodeId}
                    lastLogByNode={events.lastLogByNode}
                    onSelectNode={onSelectNode}
                  />
                }
                inspector={
                  selectedNode ? (
                    <RunInspector
                      runId={data.selectedRunId}
                      node={selectedNode}
                      approval={nodeApproval}
                      events={events.lines}
                      onApprovalResolved={onApprovalResolved}
                      onClose={() => setSheetOpen(false)}
                    />
                  ) : (
                    <div className="runs-inspector-empty">Select a node to inspect it.</div>
                  )
                }
              />
            </>
          ) : (
            <div className="runs-empty" data-testid="runs.empty">
              {data.loadingList ? "Loading runs…" : "No run selected. Pick a run from the list."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
