/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { stableNodeId } from "../porting-rules";
import { properPorter, specReviewer } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  patchResultSchema,
  specReviewSchema,
  targetSurveySchema,
  ungateInputSchema,
  ungateReportSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, Loop, smithers, outputs } = createBunPortSmithers({
  input: ungateInputSchema,
  targetSurvey: targetSurveySchema,
  patchResult: patchResultSchema,
  specReview: specReviewSchema,
  ungateReport: ungateReportSchema,
});
const KeyedLoop = Loop as any;

export default smithers((ctx) => {
  type TargetSurvey = z.infer<typeof targetSurveySchema>;
  type PatchResult = z.infer<typeof patchResultSchema>;
  type SpecReview = z.infer<typeof specReviewSchema>;
  const survey = ctx.outputMaybe(outputs.targetSurvey, { nodeId: "ungate:survey" }) as TargetSurvey | undefined;
  const patches = (ctx.outputs.patchResult ?? []) as PatchResult[];
  const reviews = (ctx.outputs.specReview ?? []) as SpecReview[];
  const targetCount = survey?.totalTargets ?? 0;
  const approvedTargets = new Set(
    reviews
      .filter((review) => review.approved)
      .map((review) => review.targetId),
  );
  const allReviewed = targetCount > 0 && reviews.length >= targetCount * 2;

  return (
    <Workflow name="bun-port-ungate-proper-port">
      <Sequence>
        <Task id="ungate:survey" output={outputs.targetSurvey}>
          {{
            totalTargets: ctx.input.targets.length,
            targets: ctx.input.targets,
          }}
        </Task>

        {survey ? (
          <Parallel maxConcurrency={Math.max(1, survey.targets.length)}>
            {survey.targets.map((target) => {
              const targetNodeId = stableNodeId(target.id);
              const accepted = approvedTargets.has(target.id);
              return (
                <KeyedLoop
                  key={target.id}
                  id={`ungate:${targetNodeId}:loop`}
                  until={accepted}
                  maxIterations={ctx.input.maxRounds ?? 5}
                  onMaxReached="return-last"
                >
                  <Sequence>
                    <Task id={`ungate:${targetNodeId}:patch`} output={outputs.patchResult} agent={properPorter}>
                      OUTPUT_KIND: proper-port
                      TARGET: {target.id}
                      CRATE: {target.crate}
                      FILE: {target.file}
                      REPO: {ctx.input.repo}

                      Remove gates or TODO bodies by porting real logic from the
                      Zig spec. Do not preserve compile-only slop.
                    </Task>

                    <Parallel maxConcurrency={2}>
                      {[0, 1].map((index) => (
                        <Task
                          key={String(index)}
                          id={`ungate:${targetNodeId}:review:${index}`}
                          output={outputs.specReview}
                          agent={specReviewer}
                        >
                          OUTPUT_KIND: spec-review
                          TARGET: {target.id}
                          VOTER: {`spec-reviewer-${index + 1}`}
                          FILE: {target.file}

                          Compare the patched Rust module against the Zig spec.
                          Reject layering workarounds, missing branches, or
                          semantic divergences.
                        </Task>
                      ))}
                    </Parallel>
                  </Sequence>
                </KeyedLoop>
              );
            })}
          </Parallel>
        ) : null}

        {survey && allReviewed ? (
          <Task id="ungate:report" output={outputs.ungateReport}>
            {{
              totalTargets: survey.totalTargets,
              patched: patches.filter((patch) => patch.status === "patched").length,
              approved: approvedTargets.size,
              rejected: survey.totalTargets - approvedTargets.size,
              summary: `Ungate/proper-port: ${approvedTargets.size}/${survey.totalTargets} target(s) approved.`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
