import { useEffect, useState } from "react";
import { RunTreeRow } from "./RunTreeRow";
import type { RunNode } from "./runState";

/** Flatten the visible (expanded) portion of the tree into rows for rendering. */
function flatten(
  node: RunNode,
  depth: number,
  expanded: Set<string>,
  out: Array<{ node: RunNode; depth: number }>,
): void {
  out.push({ node, depth });
  if (expanded.has(node.id)) {
    for (const child of node.children) flatten(child, depth + 1, expanded, out);
  }
}

function collectIds(node: RunNode, into: Set<string>): void {
  into.add(node.id);
  for (const child of node.children) collectIds(child, into);
}

/**
 * The run tree pane. Expands every node by default (an ops console wants the
 * whole run visible), tracks expansion + selection locally, and renders one
 * RunTreeRow per visible node.
 */
export function RunTree(props: {
  tree: RunNode | null;
  selectedNodeId: string | undefined;
  lastLogByNode: Map<string, string>;
  onSelectNode: (nodeId: string) => void;
}) {
  const { tree, selectedNodeId, lastLogByNode, onSelectNode } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Expand all nodes whenever a new tree arrives.
  useEffect(() => {
    if (!tree) {
      setExpanded(new Set());
      return;
    }
    const ids = new Set<string>();
    collectIds(tree, ids);
    setExpanded(ids);
  }, [tree]);

  if (!tree) {
    return <div className="runs-tree-empty">No node tree for this run yet.</div>;
  }

  const rows: Array<{ node: RunNode; depth: number }> = [];
  flatten(tree, 0, expanded, rows);

  const toggle = (nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  return (
    <div className="runs-tree" role="tree" aria-label="Run node tree">
      {rows.map(({ node, depth }) => (
        <RunTreeRow
          key={node.id}
          node={node}
          depth={depth}
          selected={node.id === selectedNodeId}
          expanded={expanded.has(node.id)}
          lastLog={lastLogByNode.get(node.id)}
          onSelect={onSelectNode}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}
