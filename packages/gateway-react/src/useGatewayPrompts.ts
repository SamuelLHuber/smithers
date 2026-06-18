import { useCallback } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import { gatewayKeys, type GatewayPromptRow } from "@smithers-orchestrator/gateway-client";
import type { ListPromptsRequest } from "@smithers-orchestrator/gateway/rpc";
import { useSyncClient } from "./sync/useSyncClient.ts";
import type { GatewayAsyncState } from "./GatewayAsyncState.ts";

/**
 * Live registered-prompt list over the `prompts` collection (initial
 * `listPrompts`, re-pulled on `invalidate`). The gateway enumerates the
 * `.smithers/prompts/**.{md,mdx}` files on disk, so the rows are read-only on the
 * wire (no write RPC) and this hook is query-only — the same `GatewayAsyncState`
 * shape the other typed gateway hooks return (mirrors `useGatewayMemoryFacts`).
 */
export function useGatewayPrompts(): GatewayAsyncState<GatewayPromptRow[]> {
  const params: ListPromptsRequest = {};
  const registry = useSyncClient();
  const collection = registry.prompts(params);
  const live = useLiveQuery((q) => q.from({ row: collection }), [collection]);
  const refetch = useCallback(async () => {
    await registry.invalidate(gatewayKeys.prompts(params));
  }, [registry, collection]);

  const data = (live.data ?? []) as GatewayPromptRow[];
  return {
    data,
    error: undefined,
    loading: !live.isReady && data.length === 0,
    refetch,
  };
}
