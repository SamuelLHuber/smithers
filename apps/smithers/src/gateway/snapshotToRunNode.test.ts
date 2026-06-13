import { describe, expect, test } from "bun:test";
import { snapshotToRunNode } from "./snapshotToRunNode";

describe("snapshotToRunNode", () => {
  test("returns null for null or undefined snapshots", () => {
    expect(snapshotToRunNode(null)).toBe(null);
    expect(snapshotToRunNode(undefined)).toBe(null);
  });

  test("returns null for the empty-root sentinel", () => {
    expect(snapshotToRunNode({ root: { id: 0, name: "(empty)", children: [] } })).toBe(null);
  });

  test("maps a running root-only snapshot to a running RunNode", () => {
    expect(
      snapshotToRunNode({
        root: { id: 1, name: "Workflow" },
        runState: { state: "running" },
      }),
    ).toEqual({
      id: "1",
      name: "Workflow",
      kind: "compute",
      status: "running",
      children: [],
    });
  });

  test("marks the blocked child as waiting", () => {
    const node = snapshotToRunNode({
      root: {
        id: 1,
        name: "Workflow",
        children: [
          { id: 2, name: "Plan", task: { nodeId: "plan" } },
          { id: 3, name: "Build", task: { nodeId: "build" } },
        ],
      },
      runState: { state: "running", blocked: { nodeId: "plan" } },
    });

    expect(node?.children?.map((child) => [child.id, child.status])).toEqual([
      ["plan", "waiting"],
      ["build", "queued"],
    ]);
  });

  test("sets root and children to ok for a finished run", () => {
    const node = snapshotToRunNode({
      root: {
        id: 1,
        name: "Workflow",
        children: [{ id: 2, name: "Plan" }],
      },
      runState: { state: "finished" },
    });

    expect(node?.status).toBe("ok");
    expect(node?.children?.[0]?.status).toBe("ok");
  });

  test("uses task identity and label before structural fields", () => {
    const node = snapshotToRunNode({
      root: {
        id: 1,
        name: "Workflow",
        children: [
          {
            id: 42,
            name: "Structural name",
            props: { label: "Props label" },
            task: { nodeId: "logical-id", label: "Task label" },
          },
        ],
      },
    });

    expect(node?.children?.[0]?.id).toBe("logical-id");
    expect(node?.children?.[0]?.name).toBe("Task label");
  });

  test("maps supported node types and defaults unknown types to compute", () => {
    const node = snapshotToRunNode({
      root: {
        id: 1,
        name: "Workflow",
        children: [
          { id: 2, name: "Approve", type: "Approval" },
          { id: 3, name: "Loop", type: "Loop" },
          { id: 4, name: "Mystery", type: "Mystery" },
        ],
      },
    });

    expect(node?.children?.map((child) => child.kind)).toEqual(["approval", "loop", "compute"]);
  });
});
