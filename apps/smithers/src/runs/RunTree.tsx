import { useState } from "react";
import type { RunNode } from "./Run";
import { RunTreeRow } from "./RunTreeRow";

/** Flatten the tree into rows, honoring the collapsed set. */
function rows(
  node: RunNode,
  depth: number,
  collapsed: Set<string>,
): Array<{ node: RunNode; depth: number }> {
  const here = [{ node, depth }];
  if (collapsed.has(node.id)) {
    return here;
  }
  return here.concat(
    (node.children ?? []).flatMap((child) => rows(child, depth + 1, collapsed)),
  );
}

/** The run's node tree with expand/collapse and a single selected node. */
export function RunTree({
  root,
  selectedId,
  onSelect,
}: {
  root: RunNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <div className="run-tree">
      {rows(root, 0, collapsed).map(({ node, depth }) => (
        <RunTreeRow
          key={node.id}
          node={node}
          depth={depth}
          selected={node.id === selectedId}
          collapsed={collapsed.has(node.id)}
          onToggle={() => toggle(node.id)}
          onSelect={() => onSelect(node.id)}
        />
      ))}
    </div>
  );
}
