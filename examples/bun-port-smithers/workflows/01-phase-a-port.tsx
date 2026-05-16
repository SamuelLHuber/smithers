/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { normalizePortFiles, stableNodeId } from "../porting-rules";
import { phaseAFixer, phaseAImplementer, phaseAVerifier } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  phaseAFixSchema,
  phaseAImplementSchema,
  phaseAInputSchema,
  phaseAPlanSchema,
  phaseAReportSchema,
  reviewSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, smithers, outputs } = createBunPortSmithers({
  input: phaseAInputSchema,
  phaseAPlan: phaseAPlanSchema,
  phaseAImplement: phaseAImplementSchema,
  phaseAReview: reviewSchema,
  phaseAFix: phaseAFixSchema,
  phaseAReport: phaseAReportSchema,
});
const KeyedSequence = Sequence as any;

export default smithers((ctx) => {
  type PhaseAPlan = z.infer<typeof phaseAPlanSchema>;
  type PhaseAImplement = z.infer<typeof phaseAImplementSchema>;
  type PhaseAReview = z.infer<typeof reviewSchema>;
  type PhaseAFix = z.infer<typeof phaseAFixSchema>;
  const plan = ctx.outputMaybe(outputs.phaseAPlan, { nodeId: "phase-a:plan" }) as PhaseAPlan | undefined;
  const implementations = (ctx.outputs.phaseAImplement ?? []) as PhaseAImplement[];
  const reviews = (ctx.outputs.phaseAReview ?? []) as PhaseAReview[];
  const fixes = (ctx.outputs.phaseAFix ?? []) as PhaseAFix[];
  const files = plan?.files ?? [];
  const allReviewed = plan ? reviews.length >= plan.total : false;
  const allFixedOrClean = plan
    ? files.every((file) => {
      const fileId = stableNodeId(file.zig);
      const review = ctx.outputMaybe(outputs.phaseAReview, { nodeId: `phase-a:${fileId}:verify` }) as PhaseAReview | undefined;
      const fix = ctx.outputMaybe(outputs.phaseAFix, { nodeId: `phase-a:${fileId}:fix` }) as PhaseAFix | undefined;
      return review?.ok === true || Boolean(fix);
    })
    : false;

  return (
    <Workflow name="bun-port-phase-a">
      <Sequence>
        <Task id="phase-a:plan" output={outputs.phaseAPlan}>
          {() => {
            const normalized = normalizePortFiles(ctx.input.files ?? []);
            return { total: normalized.length, files: normalized };
          }}
        </Task>

        {plan ? (
          <Parallel maxConcurrency={ctx.input.maxConcurrency ?? 8}>
            {files.map((file) => {
              const fileId = stableNodeId(file.zig);
              const review = ctx.outputMaybe(outputs.phaseAReview, { nodeId: `phase-a:${fileId}:verify` }) as PhaseAReview | undefined;
              const mustFix = (review?.issues ?? []).some((issue) => issue.severity !== "nit");
              return (
                <KeyedSequence key={file.zig}>
                  <Task
                    id={`phase-a:${fileId}:implement`}
                    output={outputs.phaseAImplement}
                    agent={phaseAImplementer}
                    timeoutMs={30 * 60_000}
                    retries={1}
                  >
                    OUTPUT_KIND: phase-a-implement
                    ZIG: {file.zig}
                    RS: {file.rs}
                    CRATE: {file.crate}
                    REPO: {ctx.input.repo}

                    Read docs/PORTING.md and docs/LIFETIMES.tsv. Port exactly
                    one Zig file to the computed Rust path. Preserve structure
                    and leave TODO(port) instead of guessing.
                  </Task>

                  <Task
                    id={`phase-a:${fileId}:verify`}
                    output={outputs.phaseAReview}
                    agent={phaseAVerifier}
                    timeoutMs={15 * 60_000}
                  >
                    OUTPUT_KIND: phase-a-verify
                    SUBJECT: {file.rs}
                    ZIG: {file.zig}
                    RS: {file.rs}

                    Adversarially verify the draft Rust against the Zig source
                    and PORTING.md. Report only concrete rule violations.
                  </Task>

                  {mustFix ? (
                    <Task
                      id={`phase-a:${fileId}:fix`}
                      output={outputs.phaseAFix}
                      agent={phaseAFixer}
                      timeoutMs={15 * 60_000}
                    >
                      OUTPUT_KIND: phase-a-fix
                      ZIG: {file.zig}
                      RS: {file.rs}

                      Apply only these verifier findings:
                      {JSON.stringify(review?.issues ?? [])}
                    </Task>
                  ) : null}
                </KeyedSequence>
              );
            })}
          </Parallel>
        ) : null}

        {plan && allReviewed && allFixedOrClean ? (
          <Task id="phase-a:report" output={outputs.phaseAReport}>
            {{
              total: plan.total,
              clean: reviews.filter((review) => review.ok).length,
              fixed: fixes.filter((fix) => fix.remaining === 0).length,
              failed: implementations.filter((impl) => impl.status === "failed").length,
              todoCount: implementations.reduce((sum, impl) => sum + impl.todos, 0),
              summary: `Phase A: ${reviews.filter((review) => review.ok).length}/${plan.total} clean, ${fixes.length} fix task(s).`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
