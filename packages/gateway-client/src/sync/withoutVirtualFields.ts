// Drop virtual ($-prefixed) fields and undefined values from a sync row before
// it crosses the gateway boundary. Previously copy-pasted across
// gatewayCollectionDefs, reconcileSnapshotNodes, and createGatewayCollection.
export function withoutVirtualFields<TRow extends object>(row: TRow): TRow {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith("$") && value !== undefined) {
      out[key] = value;
    }
  }
  return out as TRow;
}
