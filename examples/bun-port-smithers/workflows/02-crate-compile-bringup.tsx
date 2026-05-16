/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { groupCratesByTier, stableNodeId } from "../porting-rules";
import { crateChecker } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  compileReportSchema,
  crateCheckSchema,
  crateCompileInputSchema,
  cratePlanSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, Loop, smithers, outputs } = createBunPortSmithers({
  input: crateCompileInputSchema,
  cratePlan: cratePlanSchema,
  crateCheck: crateCheckSchema,
  compileReport: compileReportSchema,
});
const KeyedSequence = Sequence as any;
const KeyedLoop = Loop as any;

export default smithers((ctx) => {
  type CratePlan = z.infer<typeof cratePlanSchema>;
  type CrateCheck = z.infer<typeof crateCheckSchema>;
  const plan = ctx.outputMaybe(outputs.cratePlan, { nodeId: "compile:plan" }) as CratePlan | undefined;
  const checks = (ctx.outputs.crateCheck ?? []) as CrateCheck[];
  const totalCrates = plan?.totalCrates ?? 0;
  const hasAllChecks = totalCrates > 0 && checks.length >= totalCrates;

  return (
    <Workflow name="bun-port-crate-compile-bringup">
      <Sequence>
        <Task id="compile:plan" output={outputs.cratePlan}>
          {() => {
            const tiers = groupCratesByTier(ctx.input.crates ?? []).map((crates) => ({
              tier: crates[0]?.tier ?? 0,
              crates,
            }));
            return { tiers, totalCrates: tiers.reduce((sum, tier) => sum + tier.crates.length, 0) };
          }}
        </Task>

        {plan?.tiers.map((tier) => (
          <KeyedSequence key={`tier-${tier.tier}`}>
            <Parallel maxConcurrency={Math.max(1, tier.crates.length)}>
              {tier.crates.map((crate) => {
                const crateId = stableNodeId(crate.name);
                const latest = ctx.latest("crateCheck", `compile:${crateId}:check`) as CrateCheck | undefined;
                return (
                  <KeyedLoop
                    key={crate.name}
                    id={`compile:${crateId}:loop`}
                    until={latest?.compiles === true}
                    maxIterations={ctx.input.maxRounds ?? 25}
                    onMaxReached="return-last"
                  >
                    <Task
                      id={`compile:${crateId}:check`}
                      output={outputs.crateCheck}
                      agent={crateChecker}
                      timeoutMs={20 * 60_000}
                    >
                      OUTPUT_KIND: crate-check
                      CRATE: {crate.name}
                      TIER: {crate.tier}
                      REPO: {ctx.input.repo}

                      Run cargo check for bun_{crate.name}. Use gate-and-stub
                      only for compile bring-up. Return every gated module and
                      blocked upstream symbol.
                    </Task>
                  </KeyedLoop>
                );
              })}
            </Parallel>
          </KeyedSequence>
        ))}

        {hasAllChecks ? (
          <Task id="compile:report" output={outputs.compileReport}>
            {{
              totalCrates,
              green: checks.filter((check) => check.compiles).length,
              failing: checks.filter((check) => !check.compiles).length,
              gatedModules: checks.reduce((sum, check) => sum + check.gatedModules.length, 0),
              summary: `Compile bring-up: ${checks.filter((check) => check.compiles).length}/${totalCrates} crate(s) green.`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
