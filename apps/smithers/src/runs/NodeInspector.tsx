import { useState } from "react";
import { useApp } from "../app/AppContext";
import type { Run, RunNode, ToolCall } from "./Run";
import { statusTone } from "./statusMeta";

type Tab = "Output" | "Logs" | "Diff" | "Props";
const TABS: Tab[] = ["Output", "Logs", "Diff", "Props"];

function ToolCallRow({ call }: { call: ToolCall }) {
  return (
    <div className="toolcall">
      <span className={`toolcall-dot tone-${statusTone(call.status)}`} />
      <span className="toolcall-verb">{call.verb}</span>
      <span className="toolcall-target">{call.target}</span>
      {call.add !== undefined ? (
        <span className="toolcall-delta">
          <span className="delta-add">+{call.add}</span>
          <span className="delta-del">−{call.del ?? 0}</span>
        </span>
      ) : null}
    </div>
  );
}

/** The inspector's right pane: tabbed detail for the selected node. */
export function NodeInspector({
  run,
  node,
  runId,
}: {
  run: Run;
  node: RunNode;
  runId: string;
}) {
  const { openSurface, say } = useApp();
  const [tab, setTab] = useState<Tab>("Output");

  return (
    <div className="inspect-pane">
      <div className="inspect-tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "inspect-tab is-on" : "inspect-tab"}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="inspect-body">
        {tab === "Output" ? (
          <>
            <div className="kv">
              <span>node</span>
              <b>{node.name}</b>
            </div>
            <div className="kv">
              <span>agent</span>
              <b>{node.agent ?? run.model}</b>
            </div>
            {node.toolCalls?.length ? (
              <div className="toolcalls">
                {node.toolCalls.map((call) => (
                  <ToolCallRow key={call.id} call={call} />
                ))}
              </div>
            ) : node.output ? (
              <p className="node-output-text">{node.output}</p>
            ) : (
              <p className="node-empty">No output yet.</p>
            )}
            {node.status === "failed" || node.status === "running" ? (
              <button
                className="btn"
                type="button"
                onClick={() => say(`Retrying ${node.name}…`)}
              >
                ↻ Retry node
              </button>
            ) : null}
          </>
        ) : null}

        {tab === "Logs" ? (
          <>
            <pre className="node-stream">
              {`agent › working on ${node.name}\ntool  › ${
                node.toolCalls?.[0]?.verb ?? "Read"
              } ${node.toolCalls?.[0]?.target ?? node.name}`}
            </pre>
            <button
              className="btn"
              type="button"
              onClick={() => openSurface({ kind: "logs", runId })}
            >
              Open full logs →
            </button>
          </>
        ) : null}

        {tab === "Diff" ? (
          <>
            <p className="node-output-text">
              {node.toolCalls?.length
                ? `${node.toolCalls.length} file change${
                    node.toolCalls.length > 1 ? "s" : ""
                  } in this node.`
                : "No file changes in this node."}
            </p>
            <button
              className="btn"
              type="button"
              onClick={() =>
                openSurface({ kind: "diff", runId, diffId: "auth" })
              }
            >
              Review in canvas →
            </button>
          </>
        ) : null}

        {tab === "Props" ? (
          <div className="props">
            <div className="kv">
              <span>id</span>
              <b>{node.id}</b>
            </div>
            <div className="kv">
              <span>kind</span>
              <b>{node.kind}</b>
            </div>
            <div className="kv">
              <span>status</span>
              <b>{node.status}</b>
            </div>
            <div className="kv">
              <span>frame</span>
              <b>
                {run.frame} / {run.frameCount - 1}
              </b>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
