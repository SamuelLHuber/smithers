import { describe, expect, test } from "bun:test";
import { emptyContract, type ContextContract } from "./contextContract";
import { runContextDoctor } from "./contextDoctor";

function issueSeverity(contract: ContextContract, check: string) {
  return runContextDoctor(contract).find((issue) => issue.check === check)?.severity;
}

describe("runContextDoctor", () => {
  test("reports an error when the goal is empty", () => {
    expect(issueSeverity(emptyContract(), "hasGoal")).toBe("error");
  });

  test("reports ok when the goal is non-empty", () => {
    expect(issueSeverity({ ...emptyContract(), goal: "Ship the inspector" }, "hasGoal")).toBe(
      "ok",
    );
  });

  test("warns when no outputs are declared", () => {
    expect(issueSeverity(emptyContract(), "hasOutputSpec")).toBe("warning");
  });

  test("errors when a blocking criterion has no verification method", () => {
    const contract = {
      ...emptyContract(),
      acceptanceCriteria: [
        {
          criterion: "Unit tests pass",
          verificationMethod: null,
          blocking: true,
        },
      ],
    };

    expect(issueSeverity(contract, "allBlockingCriteriaHaveVerification")).toBe("error");
  });

  test("warns when a required input has no source", () => {
    const contract = {
      ...emptyContract(),
      inputs: [{ name: "deployment target", source: null }],
    };

    expect(issueSeverity(contract, "allRequiredInputsHaveSource")).toBe("warning");
  });

  test("warns when a risky side effect does not require approval", () => {
    const contract = {
      ...emptyContract(),
      sideEffects: [{ description: "deploy to production", requiresApproval: false }],
    };

    expect(issueSeverity(contract, "allSideEffectsHaveApproval")).toBe("warning");
  });

  test("reports reportSpecExists as ok for a non-empty report spec and info for null", () => {
    expect(
      issueSeverity(
        { ...emptyContract(), reportSpec: "Summarize verification." },
        "reportSpecExists",
      ),
    ).toBe("ok");
    expect(issueSeverity({ ...emptyContract(), reportSpec: null }, "reportSpecExists")).toBe(
      "info",
    );
  });
});
