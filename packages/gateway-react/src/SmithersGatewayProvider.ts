import { createElement, useMemo, type ReactNode } from "react";
import { SmithersGatewayClient, type SmithersGatewayClientOptions } from "@smithers-orchestrator/gateway-client";
import { SmithersGatewayContext } from "./SmithersGatewayContext.ts";

export function SmithersGatewayProvider(props: {
  client?: SmithersGatewayClient;
  options?: SmithersGatewayClientOptions;
  children: ReactNode;
}) {
  const client = useMemo(
    () => props.client ?? new SmithersGatewayClient(props.options),
    [props.client, props.options],
  );
  return createElement(SmithersGatewayContext.Provider, { value: client }, props.children);
}
