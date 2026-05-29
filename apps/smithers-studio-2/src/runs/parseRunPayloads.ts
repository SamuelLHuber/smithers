import {
  normalizeState,
  type ApprovalSummary,
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
 * Parse a `getRun` payload into the run-level surface model. The REAL gateway's
 * getRun returns run metadata + `summary` + a `runState`
 * ({runId,state,blocked,unhealthy,computedAt}) and carries NO node tree, so this
 * reads only run-level fields. `state` is taken from `runState.state` (the
 * computed lifecycle state) when present, falling back to the raw row `status`;
 * `tree` is left null here and merged in by the data layer from the separate
 * `getDevToolsSnapshot` RPC.
 */
export function parseRunState(payload: unknown): RunStateView {
  const record = asRecord(payload);
  const runState = asRecord(record.runState);
  const blocked = asRecord(runState.blocked);
  const runId = String(record.runId ?? runState.runId ?? "");
  return {
    runId,
    workflowKey: asString(record.workflowKey),
    state: normalizeState(runState.state ?? record.state ?? record.status),
    createdAtMs: asNumber(record.createdAtMs),
    tree: null,
    blockedNodeId: asString(blocked.nodeId),
    currentFrame: asNumber(record.currentFrame),
    frameCount: asNumber(record.frameCount),
  } satisfies RunStateView;
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
