/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { DEFAULT_SWEEPS, stableNodeId } from "../porting-rules";
import { sweepAgent } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  sweepInputSchema,
  sweepReportSchema,
  sweepResultSchema,
  sweepSurveySchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, smithers, outputs } = createBunPortSmithers({
  input: sweepInputSchema,
  sweepSurvey: sweepSurveySchema,
  sweepResult: sweepResultSchema,
  sweepReport: sweepReportSchema,
});

export default smithers((ctx) => {
  type SweepSurvey = z.infer<typeof sweepSurveySchema>;
  type SweepResult = z.infer<typeof sweepResultSchema>;
  const survey = ctx.outputMaybe(outputs.sweepSurvey, { nodeId: "sweep:survey" }) as SweepSurvey | undefined;
  const results = (ctx.outputs.sweepResult ?? []) as SweepResult[];
  const allSweepsDone = survey ? results.length >= survey.total : false;

  return (
    <Workflow name="bun-port-audit-sweeps">
      <Sequence>
        <Task id="sweep:survey" output={outputs.sweepSurvey}>
          {() => {
            const sweeps = ctx.input.sweeps.length > 0 ? ctx.input.sweeps : DEFAULT_SWEEPS;
            return { sweeps, total: sweeps.length };
          }}
        </Task>

        {survey ? (
          <Parallel maxConcurrency={Math.max(1, survey.total)}>
            {survey.sweeps.map((sweep) => (
              <Task key={sweep.id} id={`sweep:${stableNodeId(sweep.id)}`} output={outputs.sweepResult} agent={sweepAgent}>
                OUTPUT_KIND: sweep
                SWEEP: {sweep.id}
                KIND: {sweep.kind}
                PATTERN: {sweep.pattern}
                SCOPE: {sweep.scope}
                REPO: {ctx.input.repo}

                Survey candidates, classify risk, patch confirmed issues, and
                summarize fixed/skipped counts.
              </Task>
            ))}
          </Parallel>
        ) : null}

        {survey && allSweepsDone ? (
          <Task id="sweep:report" output={outputs.sweepReport}>
            {{
              totalSweeps: survey.total,
              fixed: results.reduce((sum, result) => sum + result.fixed, 0),
              skipped: results.reduce((sum, result) => sum + result.skipped, 0),
              summary: `Audit sweeps: ${results.reduce((sum, result) => sum + result.fixed, 0)} issue(s) fixed.`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
