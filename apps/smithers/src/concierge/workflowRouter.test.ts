import { describe, expect, test } from "bun:test";
import { STORE_WORKFLOWS } from "../store/workflows";
import { emptyContract, type ContextContract } from "./contextContract";
import { deriveFeatures, recommendWorkflows } from "./workflowRouter";

function contract(patch: Partial<ContextContract>): ContextContract {
  return {
    ...emptyContract(),
    ...patch,
  };
}

describe("deriveFeatures", () => {
  test("sets feature flags from contract text and structure", () => {
    const features = deriveFeatures(
      contract({
        goal:
          "Research the broken checkout crash, debug the stack trace, then implement a fix with missing tests.",
        acceptanceCriteria: [
          {
            criterion:
              "Review the change, improve coverage, and split follow-up work into tickets for an ongoing loop.",
            verificationMethod: "pnpm test",
            blocking: true,
          },
          {
            criterion: "Create a workflow scaffold for future triage.",
            verificationMethod: null,
            blocking: false,
          },
        ],
        openQuestions: ["Which payment provider should we investigate first?"],
        reportSpec: "Summarize findings and validation.",
      }),
    );

    expect(features).toEqual({
      needsResearch: true,
      needsImplementation: true,
      needsInterview: true,
      needsReview: true,
      needsDebugging: true,
      needsTestCoverage: true,
      needsLoop: true,
      needsTickets: true,
      needsReport: true,
      needsWorkflowCreation: true,
    });
  });
});

describe("recommendWorkflows", () => {
  test("returns at most five known store workflow ids", () => {
    const knownIds = new Set(STORE_WORKFLOWS.map((workflow) => workflow.id));
    const recommendations = recommendWorkflows(
      contract({
        goal:
          "Research, implement, debug, review, add test coverage, create workflow tickets, and keep working continuously.",
        openQuestions: ["What should be clarified?"],
        reportSpec: "Report the result.",
      }),
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.length).toBeLessThanOrEqual(5);
    expect(recommendations.every((recommendation) => knownIds.has(recommendation.workflow))).toBe(true);
  });

  test("ranks debug higher for a debugging-scoped contract than for research-only work", () => {
    const debugging = recommendWorkflows(
      contract({
        goal: "Debug the failing checkout bug, reproduce the error, and fix the crash.",
      }),
    );
    const researchOnly = recommendWorkflows(
      contract({
        goal: "Research payment provider options and gather context.",
      }),
    );

    const debuggingIndex = debugging.findIndex((recommendation) => recommendation.workflow === "debug");
    const researchIndex = researchOnly.findIndex((recommendation) => recommendation.workflow === "debug");

    expect(debuggingIndex).toBeGreaterThanOrEqual(0);
    expect(researchIndex).toBe(-1);
    expect(debuggingIndex).toBeLessThan(5);
  });
});
