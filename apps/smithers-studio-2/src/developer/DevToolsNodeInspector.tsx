import type { DevToolsNode } from "../devtools/DevToolsNode";

export type DevToolsNodeInspectorProps = {
  node: DevToolsNode | null;
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Right-hand pane showing the raw, unfiltered props of the selected DevTools
 * node plus its task metadata. Values are pretty-printed JSON.
 */
export function DevToolsNodeInspector({ node }: DevToolsNodeInspectorProps) {
  if (!node) {
    return (
      <div className="devtools-inspector-empty" data-testid="devtools.inspector.empty">
        Select a node to inspect its props.
      </div>
    );
  }

  const propEntries = Object.entries(node.props);

  return (
    <div className="devtools-inspector" data-testid="devtools.inspector">
      <div className="devtools-inspector-head">
        <span className={`devtools-tag devtools-type-${node.type}`}>{`<${node.name}>`}</span>
        <span className="devtools-inspector-meta">{`#${node.id} · ${node.type} · depth ${node.depth}`}</span>
      </div>
      {node.task ? (
        <div className="devtools-inspector-section" data-testid="devtools.inspector.task">
          <div className="devtools-inspector-label">task</div>
          <pre className="devtools-props">{formatValue(node.task)}</pre>
        </div>
      ) : null}
      <div className="devtools-inspector-section">
        <div className="devtools-inspector-label">props ({propEntries.length})</div>
        {propEntries.length === 0 ? (
          <div className="devtools-inspector-emptyprops">No props.</div>
        ) : (
          <table className="devtools-proptable">
            <tbody>
              {propEntries.map(([key, value]) => (
                <tr key={key}>
                  <td className="devtools-propkey">{key}</td>
                  <td className="devtools-propval">
                    <pre className="devtools-props">{formatValue(value)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
