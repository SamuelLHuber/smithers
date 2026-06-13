import { describe, expect, test } from "bun:test";
import { runToFlow } from "./runToFlow";
import type { Run, RunNode } from "./Run";

function runFrom(children: RunNode[]): Run {
  return {
    id: "run-1",
    title: "Spec Title",
    model: "claude",
    runId: "42",
    status: "running",
    startedAtMs: 0,
    frame: 0,
    frameCount: 1,
    root: {
      id: "root",
      name: "Root Workflow",
      kind: "merge",
      status: "running",
      children,
    },
  };
}

describe("runToFlow", () => {
  test("adapts a three-step run into three nodes and two linear edges", () => {
    const flow = runToFlow(
      runFrom([
        { id: "plan", name: "Plan", kind: "agent", status: "ok", meta: "done" },
        { id: "build", name: "Build", kind: "compute", status: "running" },
        { id: "verify", name: "Verify", kind: "approval", status: "queued" },
      ]),
    );

    expect(flow.nodes.map((node) => node.id)).toEqual(["plan", "build", "verify"]);
    expect(flow.edges).toHaveLength(2);
    expect(flow.edges.map((edge) => edge.id)).toEqual(["plan->build", "build->verify"]);
    expect(flow.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["plan", "build"],
      ["build", "verify"],
    ]);
  });

  test("uses step meta as node output and falls back to status", () => {
    const flow = runToFlow(
      runFrom([
        { id: "plan", name: "Plan", kind: "agent", status: "ok", meta: "8s" },
        { id: "build", name: "Build", kind: "compute", status: "running" },
      ]),
    );

    expect(flow.nodes.map((node) => node.data.output)).toEqual(["8s", "running"]);
  });

  test("adapts a single-step run into one node and no edges", () => {
    const flow = runToFlow(
      runFrom([{ id: "plan", name: "Plan", kind: "agent", status: "ok" }]),
    );

    expect(flow.nodes.map((node) => node.id)).toEqual(["plan"]);
    expect(flow.edges).toEqual([]);
  });
});
