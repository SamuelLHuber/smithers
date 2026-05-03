import { useCallback, useEffect, useMemo, useState } from "react";
import type { GatewayRpcMethod } from "@smithers-orchestrator/gateway/rpc";
import type { GatewayRpcParams, GatewayRpcPayload } from "@smithers-orchestrator/gateway-client";
import { useSmithersGateway } from "./useSmithersGateway.ts";
import type { GatewayAsyncState } from "./GatewayAsyncState.ts";

export function useGatewayRpc<Method extends GatewayRpcMethod>(
  method: Method,
  params: GatewayRpcParams<Method>,
  options: { enabled?: boolean; deps?: readonly unknown[] } = {},
): GatewayAsyncState<GatewayRpcPayload<Method>> {
  const client = useSmithersGateway();
  const enabled = options.enabled ?? true;
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);
  const deps = options.deps ?? [paramsKey];
  const [data, setData] = useState<GatewayRpcPayload<Method>>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(enabled);

  const refetch = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      setData(await client.rpc(method, params));
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, [client, enabled, method, paramsKey]);

  useEffect(() => {
    void refetch();
  }, [refetch, ...deps]);

  return { data, error, loading, refetch };
}
