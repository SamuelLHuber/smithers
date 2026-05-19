import { describe, expect, test } from "bun:test";
import {
  GATEWAY_RPC_DEFINITIONS,
  GATEWAY_RPC_ERRORS,
  SMITHERS_API_VERSION,
  canonicalGatewayRpcMethod,
  getGatewayRpcDefinition,
  getRequiredScopeForGatewayMethod,
  getGatewayScopeValues,
  isGatewayRpcMethod,
  listGatewayRpcMethods,
} from "../src/rpc/index.ts";
import { GATEWAY_SCOPE_VALUES, hasGatewayScope } from "../src/auth/scopes.ts";

describe("Gateway RPC contract", () => {
  test("freezes every stable v1 RPC with typed schemas and versioned errors", () => {
    expect(listGatewayRpcMethods()).toEqual([
      "launchRun",
      "resumeRun",
      "cancelRun",
      "hijackRun",
      "rewindRun",
      "submitApproval",
      "submitSignal",
      "getRun",
      "listRuns",
      "listWorkflows",
      "listApprovals",
      "streamRunEvents",
      "streamDevTools",
      "getNodeOutput",
      "getNodeDiff",
      "cronList",
      "cronCreate",
      "cronDelete",
      "cronRun",
    ]);

    for (const definition of GATEWAY_RPC_DEFINITIONS) {
      expect(definition.version).toBe(SMITHERS_API_VERSION);
      expect(definition.maturity).toBe("stable");
      expect(GATEWAY_SCOPE_VALUES).toContain(definition.requiredScope);
      expect(definition.requestSchema).toBeDefined();
      expect(definition.responseSchema).toBeDefined();
      expect(JSON.parse(JSON.stringify(definition.exampleRequest))).toEqual(definition.exampleRequest);
      expect(JSON.parse(JSON.stringify(definition.exampleResponse))).toEqual(definition.exampleResponse);
      for (const code of definition.errors) {
        expect(GATEWAY_RPC_ERRORS[code].version).toBe(SMITHERS_API_VERSION);
      }
    }
  });

  test("maps legacy methods to stable definitions without duplicating the contract", () => {
    expect(canonicalGatewayRpcMethod("runs.create")).toBe("launchRun");
    expect(canonicalGatewayRpcMethod("approvals.decide")).toBe("submitApproval");
    expect(canonicalGatewayRpcMethod("cron.trigger")).toBe("cronRun");
    expect(getGatewayRpcDefinition("runs.create")?.method).toBe("launchRun");
    expect(getRequiredScopeForGatewayMethod("health")).toBe("run:read");
    expect(getRequiredScopeForGatewayMethod("approvals.list")).toBe("run:read");
    expect(getRequiredScopeForGatewayMethod("streamDevTools")).toBe("observability:read");
    expect(getRequiredScopeForGatewayMethod("workflows.list")).toBe("run:read");
    expect(getRequiredScopeForGatewayMethod("runs.diff")).toBe("run:read");
    expect(getRequiredScopeForGatewayMethod("getDevToolsSnapshot")).toBe("observability:read");
    expect(getRequiredScopeForGatewayMethod("runs.rerun")).toBe("run:write");
    expect(getRequiredScopeForGatewayMethod("approve")).toBe("approval:submit");
    expect(isGatewayRpcMethod("launchRun")).toBe(true);
    expect(isGatewayRpcMethod("runs.create")).toBe(false);
    expect(getGatewayScopeValues()).toEqual(GATEWAY_SCOPE_VALUES);
  });

  test("enforces scoped auth with legacy compatibility", () => {
    expect(hasGatewayScope([" * "], "run:admin", "hijackRun")).toBe(true);
    expect(hasGatewayScope(["run:write"], "run:read", "getRun")).toBe(true);
    expect(hasGatewayScope(["run:read"], "run:write", "launchRun")).toBe(false);
    expect(hasGatewayScope(["read"], "observability:read", "streamDevTools")).toBe(true);
    expect(hasGatewayScope(["execute"], "run:write", "runs.create")).toBe(true);
    expect(hasGatewayScope(["approve"], "approval:submit", "submitApproval")).toBe(true);
    expect(hasGatewayScope(["admin"], "run:admin", "hijackRun")).toBe(true);
    expect(hasGatewayScope(["approval:submit"], "approval:submit", "submitApproval")).toBe(true);
    expect(hasGatewayScope(["approval:submit"], "run:read", "getRun")).toBe(false);
    expect(hasGatewayScope(["cron:write"], "cron:read", "cronList")).toBe(true);
    expect(hasGatewayScope(["cron:read"], "cron:write", "cronCreate")).toBe(false);
    expect(hasGatewayScope(["runs.*"], "run:write", "runs.create")).toBe(true);
    expect(hasGatewayScope(["getRun"], "run:read", "getRun")).toBe(true);
    expect(hasGatewayScope(["unknown"], "run:read", "getRun")).toBe(false);
  });
});
