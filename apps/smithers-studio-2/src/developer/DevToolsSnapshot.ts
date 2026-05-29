import type { DevToolsNode } from "./DevToolsNode";

/**
 * A full DevTools snapshot for one run — the payload returned by the gateway
 * `getDevToolsSnapshot` RPC.
 */
export type DevToolsSnapshot = {
  version: 1;
  runId: string;
  frameNo: number;
  seq: number;
  root: DevToolsNode;
};
