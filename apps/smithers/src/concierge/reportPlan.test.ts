import { describe, expect, test } from "bun:test";
import type { ContextContract } from "./contextContract";
import { buildReport, REPORT_SLIDE_TITLES } from "./reportPlan";

const RUNTIME_PLACEHOLDER = "_Filled in after the run._";

function populatedContract(): ContextContract {
  return {
    goal: "Ship the auth refactor safely",
    scope: "Touch only the login and session paths",
    nonGoals: ["Do not redesign onboarding"],
    assumptions: ["The Plue seeded token is available"],
    decisions: ["Use the existing zustand store"],
    openQuestions: ["Should rollout include beta users first?"],
    deferredQuestions: ["Whether to migrate older sessions"],
    inputs: [{ name: "Auth plan", source: "docs/auth-plan.md" }],
    outputs: ["Merged auth refactor"],
    tools: ["pnpm test:unit"],
    skills: ["openai-docs"],
    memory: {
      persist: ["Auth refactor uses seeded Plue token"],
      doNotPersist: ["Scratch OAuth token"],
    },
    acceptanceCriteria: [
      {
        criterion: "Unit tests pass",
        verificationMethod: "pnpm -C apps/smithers test:unit",
        blocking: true,
      },
      {
        criterion: "Manual smoke notes captured",
        verificationMethod: null,
        blocking: false,
      },
    ],
    sideEffects: [{ description: "Create a commit", requiresApproval: false }],
    reportSpec: "Fourteen-slide run report",
  };
}

function slideBody(report: ReturnType<typeof buildReport>, title: string): string {
  const slide = report.find((entry) => entry.title === title);
  expect(slide).toBeDefined();
  return slide?.body ?? "";
}

describe("buildReport", () => {
  test("always emits exactly the canonical fourteen slides in order", () => {
    const report = buildReport("ship the auth refactor", populatedContract());

    expect(report).toHaveLength(14);
    expect(report.map((slide) => slide.title)).toEqual(REPORT_SLIDE_TITLES);
  });

  test("fills contract-derived slides with non-placeholder content", () => {
    const report = buildReport("ship the auth refactor", populatedContract());

    expect(slideBody(report, "Original script")).toContain("ship the auth refactor");
    expect(slideBody(report, "Final objective")).toContain("Ship the auth refactor safely");
    expect(slideBody(report, "Backpressure gates")).toContain("Unit tests pass");
    expect(slideBody(report, "Tests/evals & results")).toContain("pnpm -C apps/smithers test:unit");

    for (const title of [
      "Original script",
      "Final objective",
      "Backpressure gates",
    ]) {
      expect(slideBody(report, title)).not.toBe(RUNTIME_PLACEHOLDER);
    }
  });

  test("keeps runtime-only slides on the runtime placeholder body", () => {
    const report = buildReport("ship the auth refactor", populatedContract());

    for (const title of [
      "Artifacts",
      "Failures/retries",
      "Remaining issues",
      "Recommended next run",
      "Reusable skill/workflow",
    ]) {
      expect(slideBody(report, title)).toBe(RUNTIME_PLACEHOLDER);
    }
  });
});
