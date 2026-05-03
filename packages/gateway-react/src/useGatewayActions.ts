import { useMemo } from "react";
import { useSmithersGateway } from "./useSmithersGateway.ts";

export function useGatewayActions() {
  const client = useSmithersGateway();
  return useMemo(
    () => ({
      launchRun: client.launchRun.bind(client),
      resumeRun: client.resumeRun.bind(client),
      cancelRun: client.cancelRun.bind(client),
      submitApproval: client.submitApproval.bind(client),
      submitSignal: client.submitSignal.bind(client),
    }),
    [client],
  );
}
