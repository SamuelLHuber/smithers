import {
  normalizeState,
  type ApprovalSummary,
  type RunNode,
  type RunStateView,
  type RunSummary,
} from "./runState";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Parse a listRuns payload (array of run summaries) into RunSummary rows. */
export function parseRunSummaries(payload: unknown): RunSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((raw) => {
    const record = asRecord(raw);
    return {
      runId: String(record.runId ?? ""),
      workflowKey: asString(record.workflowKey),
      status: normalizeState(record.status),
      createdAtMs: asNumber(record.createdAtMs),
    } satisfies RunSummary;
  }).filter((row) => row.runId.length > 0);
}

/**
 * Parse a getRun RunStateView into the surface model. The wire object carries
 * the live node tree under `tree` (preferred) or a flat `nodes` array that we
 * fold into a single-root tree. State lives under `state` or `status`.
 */
export function parseRunState(payload: unknown): RunStateView {
  const record = asRecord(payload);
  const runId = String(record.runId ?? "");
  const tree = parseNode(record.tree) ?? foldNodes(record.nodes);
  return {
    runId,
    workflowKey: asString(record.workflowKey),
    state: normalizeState(record.state ?? record.status),
    createdAtMs: asNumber(record.createdAtMs),
    tree,
    currentFrame: asNumber(record.currentFrame),
    frameCount: asNumber(record.frameCount),
  } satisfies RunStateView;
}

function parseNode(raw: unknown): RunNode | null {
  const record = asRecord(raw);
  const id = record.id;
  if (id === undefined || id === null) return null;
  const childrenRaw = Array.isArray(record.children) ? record.children : [];
  const children = childrenRaw
    .map((child) => parseNode(child))
    .filter((child): child is RunNode => child !== null);
  return {
    id: String(id),
    type: asString(record.type) ?? "node",
    name: asString(record.name) ?? String(id),
    state: normalizeState(record.state ?? record.status),
    keyProps: asString(record.keyProps),
    lastLog: asString(record.lastLog),
    children,
  } satisfies RunNode;
}

/** Fold a flat `nodes` array (each with optional parentId) into a tree. */
function foldNodes(raw: unknown): RunNode | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const byId = new Map<string, RunNode>();
  const parentOf = new Map<string, string | undefined>();
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = record.id;
    if (id === undefined || id === null) continue;
    const nodeId = String(id);
    byId.set(nodeId, {
      id: nodeId,
      type: asString(record.type) ?? "node",
      name: asString(record.name) ?? nodeId,
      state: normalizeState(record.state ?? record.status),
      keyProps: asString(record.keyProps),
      lastLog: asString(record.lastLog),
      children: [],
    });
    parentOf.set(nodeId, asString(record.parentId));
  }
  let root: RunNode | null = null;
  for (const [nodeId, node] of byId) {
    const parentId = parentOf.get(nodeId);
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else if (!root) {
      root = node;
    }
  }
  return root;
}

/** Parse a listApprovals payload (array of approval summaries). */
export function parseApprovals(payload: unknown): ApprovalSummary[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((raw) => {
    const record = asRecord(raw);
    return {
      runId: String(record.runId ?? ""),
      workflowKey: asString(record.workflowKey),
      nodeId: String(record.nodeId ?? ""),
      iteration: asNumber(record.iteration) ?? 0,
      requestTitle: asString(record.requestTitle),
      requestSummary: asString(record.requestSummary),
      requestedAtMs: asNumber(record.requestedAtMs) ?? null,
    } satisfies ApprovalSummary;
  }).filter((row) => row.runId.length > 0 && row.nodeId.length > 0);
}
