// Shared object guards for the gateway-client. Previously copy-pasted across
// SmithersGatewayClient, SmithersGatewayConnection, createSmithersGatewayTransport,
// gatewayCollectionDefs, and snapshotToGatewayRunNode.

/** Narrow an unknown value to a plain (non-array, non-null) object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Coerce an unknown value to a record, returning {} when it is not a plain object. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
