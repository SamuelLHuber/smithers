import { useCallback } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { gatewayKeys, type GatewayMemoryFactRow } from "@smithers-orchestrator/gateway-client";
import type { ListMemoryFactsRequest } from "@smithers-orchestrator/gateway/rpc";
import { useSyncClient } from "./sync/useSyncClient.ts";
import type { GatewayAsyncState } from "./GatewayAsyncState.ts";

/**
 * Live cross-run memory facts over the `memoryFacts` collection (initial
 * `listMemoryFacts`, re-pulled on `invalidate`). Pass a `namespace` to scope the
 * list to one namespace; omit it to list every namespace's facts. The facts are
 * read-only on the wire (no write RPC), so this hook is query-only — the same
 * `GatewayAsyncState` shape the other typed gateway hooks return (mirrors
 * `useGatewayCrons`).
 */
export function useGatewayMemoryFacts(namespace?: string): GatewayAsyncState<GatewayMemoryFactRow[]> {
  const params: ListMemoryFactsRequest = namespace ? { namespace } : {};
  const registry = useSyncClient();
  const collection = registry.memoryFacts(params);
  const live = useLiveQuery((q) => q.from({ row: collection }), [collection]);
  const refetch = useCallback(async () => {
    await registry.invalidate(gatewayKeys.memoryFacts(params));
  }, [registry, collection]);

  const data = (live.data ?? []) as GatewayMemoryFactRow[];
  return {
    data,
    error: undefined,
    loading: !live.isReady && data.length === 0,
    refetch,
  };
}
