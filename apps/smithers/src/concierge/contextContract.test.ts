import { describe, expect, test } from "bun:test";
import { emptyContract, mergeContract, type ContextContract } from "./contextContract";

function baseContract(): ContextContract {
  return {
    ...emptyContract(),
    goal: "Ship the console",
    scope: "Context engineering",
    nonGoals: ["Rewrite backend"],
    assumptions: ["User has a repo"],
    decisions: ["Use Bun tests"],
    openQuestions: ["Which model?"],
    deferredQuestions: ["Which dashboard?"],
    inputs: [{ name: "ticket", source: "planner" }],
    outputs: ["patch"],
    tools: ["shell"],
    skills: ["typescript"],
    memory: {
      persist: ["project conventions"],
      doNotPersist: ["scratch token"],
    },
    acceptanceCriteria: [
      {
        criterion: "Unit tests pass",
        verificationMethod: "pnpm test:unit",
        blocking: true,
      },
    ],
    sideEffects: [{ description: "Write tests", requiresApproval: false }],
    reportSpec: "Summarize changes",
  };
}

describe("emptyContract", () => {
  test("returns a fully-shaped empty contract", () => {
    expect(emptyContract()).toEqual({
      goal: "",
      scope: "",
      nonGoals: [],
      assumptions: [],
      decisions: [],
      openQuestions: [],
      deferredQuestions: [],
      inputs: [],
      outputs: [],
      tools: [],
      skills: [],
      memory: { persist: [], doNotPersist: [] },
      acceptanceCriteria: [],
      sideEffects: [],
      reportSpec: null,
    });
  });
});

describe("mergeContract", () => {
  test("overrides only named keys from a sparse patch", () => {
    const base = baseContract();
    const merged = mergeContract(base, {
      goal: "Add unit tests",
      outputs: ["tests"],
      reportSpec: null,
    });

    expect(merged).toEqual({
      ...base,
      goal: "Add unit tests",
      outputs: ["tests"],
      reportSpec: null,
    });
  });

  test("deep-merges memory buckets independently", () => {
    const base = baseContract();
    const merged = mergeContract(base, {
      memory: { persist: ["new convention"] },
    } as unknown as Partial<ContextContract>);

    expect(merged.memory).toEqual({
      persist: ["new convention"],
      doNotPersist: ["scratch token"],
    });
  });

  test("does not mutate the base contract", () => {
    const base = baseContract();
    const snapshot = structuredClone(base);

    const merged = mergeContract(base, {
      goal: "Changed goal",
      memory: { doNotPersist: ["new secret"] },
      sideEffects: [{ description: "Commit files", requiresApproval: false }],
    } as unknown as Partial<ContextContract>);

    expect(base).toEqual(snapshot);
    expect(merged).not.toEqual(base);
  });
});
