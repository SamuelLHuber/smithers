import { describe, expect, test } from "bun:test";
import { selectApproval } from "./selectApproval";
import type { RunState } from "./runsStore";

function runState(overrides: Partial<RunState> = {}): RunState {
  return {
    id: "run-1",
    title: "Implement auth refactor",
    model: "claude-opus",
    runId: "1",
    startedAtMs: 1_700_000_000_000,
    frame: 0,
    maxFrame: 0,
    gate: "none",
    ...overrides,
  };
}

describe("selectApproval", () => {
  test("returns undefined for a missing run", () => {
    expect(selectApproval([runState()], "missing")).toBeUndefined();
  });

  test("returns undefined when the run has no gate", () => {
    expect(selectApproval([runState({ gate: "none" })], "run-1")).toBeUndefined();
  });

  test("maps a pending gate to a pending approval", () => {
    expect(selectApproval([runState({ gate: "pending" })], "run-1")).toEqual({
      runId: "run-1",
      title: "Implement auth refactor",
      gate: "deploy-to-prod",
      status: "pending",
      note: undefined,
    });
  });

  test.each(["approved", "denied"] as const)("passes through a %s gate", (gate) => {
    expect(selectApproval([runState({ gate, note: "reviewed" })], "run-1")).toEqual({
      runId: "run-1",
      title: "Implement auth refactor",
      gate: "deploy-to-prod",
      status: gate,
      note: "reviewed",
    });
  });
});
