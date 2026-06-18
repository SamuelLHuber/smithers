import { useCallback } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { gatewayKeys, type GatewayCronRow } from "@smithers-orchestrator/gateway-client";
import type { CronListRequest } from "@smithers-orchestrator/gateway/rpc";
import { useSyncClient } from "./sync/useSyncClient.ts";
import type { GatewayAsyncState } from "./GatewayAsyncState.ts";

/**
 * Live cron-schedule list over the `crons` collection (initial `cronList`,
 * re-pulled on `invalidate` — e.g. after a `cronCreate` / `cronDelete` / `cronRun`
 * mutation). `cronList` returns ALL crons (enabled + disabled), so disabled rows
 * surface too. Same `GatewayAsyncState` shape the other typed gateway hooks
 * return (mirrors `useGatewayApprovals`).
 */
export function useGatewayCrons(params: CronListRequest = {}): GatewayAsyncState<GatewayCronRow[]> {
  const registry = useSyncClient();
  const collection = registry.crons(params);
  const live = useLiveQuery((q) => q.from({ row: collection }), [collection]);
  const refetch = useCallback(async () => {
    await registry.invalidate(gatewayKeys.cronList(params));
  }, [registry, collection]);

  const data = (live.data ?? []) as GatewayCronRow[];
  return {
    data,
    error: undefined,
    loading: !live.isReady && data.length === 0,
    refetch,
  };
}
