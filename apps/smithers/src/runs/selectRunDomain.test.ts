import { describe, expect, test } from "bun:test";
import { AUTH_REFACTOR_FRAMES } from "./authRefactorFrames";
import { selectApproval } from "./selectApproval";
import { selectRun } from "./selectRun";
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

describe("selectRun", () => {
  test("returns undefined for a missing run", () => {
    expect(selectRun([runState()], "missing")).toBeUndefined();
  });

  test("resolves the requested run frame", () => {
    const selected = selectRun([runState({ frame: 2 })], "run-1");

    expect(selected?.frame).toBe(2);
    expect(selected?.root).toBe(AUTH_REFACTOR_FRAMES[2]);
    expect(selected?.status).toBe(AUTH_REFACTOR_FRAMES[2].status);
  });

  test("clamps the frame to the last auth refactor frame", () => {
    const lastFrame = AUTH_REFACTOR_FRAMES.length - 1;
    const selected = selectRun([runState({ frame: 999 })], "run-1");

    expect(selected?.frame).toBe(lastFrame);
    expect(selected?.root).toBe(AUTH_REFACTOR_FRAMES[lastFrame]);
  });

  test("overrides status to failed when canceled", () => {
    const selected = selectRun([runState({ canceled: true, frame: 2 })], "run-1");

    expect(selected?.status).toBe("failed");
  });

  test("overrides status to failed when gate is denied", () => {
    const selected = selectRun([runState({ gate: "denied", frame: 4 })], "run-1");

    expect(selected?.status).toBe("failed");
  });
});

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

  test.each(["approved", "denied"] as const)("maps a %s gate through", (gate) => {
    expect(selectApproval([runState({ gate, note: "reviewed" })], "run-1")).toEqual({
      runId: "run-1",
      title: "Implement auth refactor",
      gate: "deploy-to-prod",
      status: gate,
      note: "reviewed",
    });
  });
});
