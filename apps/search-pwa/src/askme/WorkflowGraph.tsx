import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import type { SmithersFlowNode } from "./workflowFlow";

function SmithersTaskNode({ data }: NodeProps<SmithersFlowNode>) {
  return (
    <div className={`smithers-node smithers-node-${data.kind}`}>
      <Handle type="target" position={Position.Left} />
      <div className="node-kicker">{data.kind}</div>
      <div className="node-title">{data.label}</div>
      <div className="node-output">{data.output}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { smithersTask: SmithersTaskNode };

/** A static, read-only n8n-style render of a Smithers workflow. */
export function WorkflowGraph({
  nodes,
  edges,
}: {
  nodes: SmithersFlowNode[];
  edges: Edge[];
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.35}
      nodesDraggable={false}
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={26} color="#e2e7ef" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
