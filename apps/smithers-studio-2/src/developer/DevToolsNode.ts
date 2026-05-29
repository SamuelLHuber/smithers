/**
 * A single node in the raw DevTools snapshot tree. Structurally mirrors the
 * gateway's `@smithers-orchestrator/protocol` DevToolsNode; redeclared locally
 * so the developer surface owns its own contract and stays self-contained.
 */
export type DevToolsNode = {
  id: number;
  type: string;
  name: string;
  props: Record<string, unknown>;
  task?: {
    nodeId: string;
    kind: "agent" | "compute" | "static";
    agent?: string;
    label?: string;
    outputTableName?: string;
    iteration?: number;
  };
  children: DevToolsNode[];
  depth: number;
};
