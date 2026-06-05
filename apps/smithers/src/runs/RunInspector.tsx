import { useState } from "react";
import { useApp } from "../app/AppContext";
import { WorkflowGraph } from "../askme/WorkflowGraph";
import { StatusPill } from "../cards/StatusPill";
import { findNode } from "./Run";
import { NodeInspector } from "./NodeInspector";
import { RunTree } from "./RunTree";
import { runToFlow } from "./runToFlow";

type View = "tree" | "graph";

/**
 * The run inspector surface (canvas): header with a Tree/Graph toggle, the node
 * tree on the left, and the selected node's detail on the right. Reads the run
 * live from the engine so it advances while open.
 */
export function RunInspector({
  runId,
  theme,
}: {
  runId: string;
  theme: "light" | "dark";
}) {
  const { engine } = useApp();
  const [view, setView] = useState<View>("tree");
  const [selectedId, setSelectedId] = useState("edit-files");
  const run = engine.getRun(runId);

  if (!run) {
    return <div className="surface-empty">Run not found.</div>;
  }

  const selected = findNode(run.root, selectedId) ?? run.root;
  const flow = view === "graph" ? runToFlow(run) : null;

  return (
    <section className="surface" data-testid="run-inspector">
      <header className="surface-head">
        <span className="surface-title">{run.title}</span>
        <StatusPill status={run.status} />
        <div className="seg">
          <button
            type="button"
            className={view === "tree" ? "is-on" : ""}
            onClick={() => setView("tree")}
          >
            Tree
          </button>
          <button
            type="button"
            className={view === "graph" ? "is-on" : ""}
            onClick={() => setView("graph")}
          >
            Graph
          </button>
        </div>
      </header>

      {view === "tree" ? (
        <div className="inspector-body">
          <div className="tree-pane">
            <RunTree
              root={run.root}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
          <NodeInspector run={run} node={selected} runId={runId} />
        </div>
      ) : (
        <div className="graph-pane">
          {flow ? (
            <WorkflowGraph nodes={flow.nodes} edges={flow.edges} theme={theme} />
          ) : null}
        </div>
      )}
    </section>
  );
}
