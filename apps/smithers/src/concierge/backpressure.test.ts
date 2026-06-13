import { describe, expect, test } from "bun:test";
import { emptyContract, type ContextContract } from "./contextContract";
import { planBackpressure, type Gate } from "./backpressure";

function contractWithCriteria(
  criteria: Array<{ criterion: string; blocking?: boolean }>,
): ContextContract {
  return {
    ...emptyContract(),
    acceptanceCriteria: criteria.map(({ criterion, blocking = true }) => ({
      criterion,
      verificationMethod: null,
      blocking,
    })),
  };
}

describe("planBackpressure", () => {
  test("empty contract produces no gates", () => {
    expect(planBackpressure(emptyContract())).toEqual([]);
  });

  test("maps keyword matches to verification methods in declared priority order", () => {
    const gates = planBackpressure(
      contractWithCriteria([
        { criterion: "Schema output stays valid" },
        { criterion: "Human approval is required before release" },
        { criterion: "Unit test suite passes" },
        { criterion: "Integration workflow succeeds" },
        { criterion: "Eval benchmark score does not regress" },
        { criterion: "Review cites source references" },
        { criterion: "Trace logs include a telemetry span" },
        { criterion: "Publish tests pass before handoff" },
      ]),
    );

    expect(gates.map((gate) => gate.verificationMethod)).toEqual([
      "schema",
      "approval",
      "unit_test",
      "integration_test",
      "eval",
      "review",
      "trace",
      "approval",
    ]);
  });

  test("sets blocking and warning failure actions from the criterion", () => {
    const [blocking, warning] = planBackpressure(
      contractWithCriteria([
        { criterion: "Schema output validates", blocking: true },
        { criterion: "Review note is attached", blocking: false },
      ]),
    );

    expect(blocking).toMatchObject({
      gateType: "blocking",
      failureAction: "Halt the work and fix: Schema output validates",
    });
    expect(warning).toMatchObject({
      gateType: "warning",
      failureAction: "Record the failure and surface: Review note is attached",
    });
  });

  test("requires the expected evidence for every verification method", () => {
    const gates = planBackpressure(
      contractWithCriteria([
        { criterion: "Schema output stays valid" },
        { criterion: "Human approval is required before release" },
        { criterion: "Unit test suite passes" },
        { criterion: "Integration workflow succeeds" },
        { criterion: "Eval benchmark score does not regress" },
        { criterion: "Review cites source references" },
        { criterion: "Trace logs include a telemetry span" },
        { criterion: "Operator confirms the handoff details" },
      ]),
    );
    const evidenceByMethod = Object.fromEntries(
      gates.map((gate) => [gate.verificationMethod, gate.evidenceRequired]),
    ) as Record<Gate["verificationMethod"], string[]>;

    expect(evidenceByMethod).toEqual({
      schema: ["schema_validation_output"],
      approval: ["approval_record"],
      unit_test: ["unit_test_results"],
      integration_test: ["integration_test_results"],
      eval: ["eval_report", "score"],
      review: ["review_notes", "cited_sources"],
      trace: ["trace_id", "log_excerpt"],
      manual_check: ["checklist_note"],
    });
  });

  test("falls back to manual_check when no keyword matches", () => {
    expect(
      planBackpressure(contractWithCriteria([{ criterion: "Operator confirms the handoff details" }]))[0],
    ).toMatchObject({
      verificationMethod: "manual_check",
      evidenceRequired: ["checklist_note"],
    });
  });

  test("keeps gates in the same order as the input criteria", () => {
    const gates = planBackpressure(
      contractWithCriteria([
        { criterion: "First operator confirmation" },
        { criterion: "Second schema validation" },
        { criterion: "Third approval before publish" },
      ]),
    );

    expect(gates.map((gate) => gate.criterion)).toEqual([
      "First operator confirmation",
      "Second schema validation",
      "Third approval before publish",
    ]);
  });
});
