/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { DEFAULT_PROBES, dedupeFailures, stableNodeId } from "../porting-rules";
import { builder, failureFixer, prober } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  buildResultSchema,
  failureFixSchema,
  failureSetSchema,
  probeInputSchema,
  probeReportSchema,
  probeResultSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, smithers, outputs } = createBunPortSmithers({
  input: probeInputSchema,
  buildResult: buildResultSchema,
  probeResult: probeResultSchema,
  failureSet: failureSetSchema,
  failureFix: failureFixSchema,
  probeReport: probeReportSchema,
});

export default smithers((ctx) => {
  const probes = ctx.input.probes.length > 0 ? ctx.input.probes : DEFAULT_PROBES;
  type BuildResult = z.infer<typeof buildResultSchema>;
  type ProbeResult = z.infer<typeof probeResultSchema>;
  type FailureSet = z.infer<typeof failureSetSchema>;
  type FailureFix = z.infer<typeof failureFixSchema>;
  const build = ctx.outputMaybe(outputs.buildResult, { nodeId: "probe:build" }) as BuildResult | undefined;
  const results = (ctx.outputs.probeResult ?? []) as ProbeResult[];
  const failures = ctx.outputMaybe(outputs.failureSet, { nodeId: "probe:dedupe" }) as FailureSet | undefined;
  const fixes = (ctx.outputs.failureFix ?? []) as FailureFix[];
  const allProbed = results.length >= probes.length;
  const allFixed = failures ? fixes.length >= failures.totalFailures : false;

  return (
    <Workflow name="bun-port-panic-probe-swarm">
      <Sequence>
        <Task id="probe:build" output={outputs.buildResult} agent={builder}>
          OUTPUT_KIND: build
          REPO: {ctx.input.repo}

          Build bun_bin once before running probes.
        </Task>

        {build?.ok ? (
          <Parallel maxConcurrency={Math.max(1, probes.length)}>
            {probes.map((probe) => (
              <Task key={probe.id} id={`probe:run:${stableNodeId(probe.id)}`} output={outputs.probeResult} agent={prober}>
                OUTPUT_KIND: probe
                PROBE: {probe.id}
                COMMAND: {probe.cmd}
                EXPECT: {probe.expect ?? ""}

                Run ./target/debug/bun-rs {probe.cmd}. Capture panic location,
                assertion, signal, timeout, and output.
              </Task>
            ))}
          </Parallel>
        ) : null}

        {allProbed ? (
          <Task id="probe:dedupe" output={outputs.failureSet}>
            {() => {
              const unique = dedupeFailures(results).map((failure) => ({
                failureKey: failure.failureKey,
                probeId: failure.probeId,
                command: failure.command,
                panicLocation: failure.panicLocation,
                assertion: failure.assertion,
              }));
              return { totalFailures: unique.length, failures: unique };
            }}
          </Task>
        ) : null}

        {failures ? (
          <Parallel maxConcurrency={Math.max(1, failures.totalFailures)}>
            {failures.failures.map((failure) => (
              <Task
                key={failure.failureKey}
                id={`probe:fix:${stableNodeId(failure.failureKey)}`}
                output={outputs.failureFix}
                agent={failureFixer}
                skipIf={failures.totalFailures === 0}
              >
                OUTPUT_KIND: failure-fix
                FAILURE: {failure.failureKey}
                COMMAND: {failure.command}

                Fix the root cause by reading the Rust panic site and Zig spec.
              </Task>
            ))}
          </Parallel>
        ) : null}

        {failures && allFixed ? (
          <Task id="probe:report" output={outputs.probeReport}>
            {{
              totalProbes: probes.length,
              passed: results.filter((result) => result.passed).length,
              uniqueFailures: failures.totalFailures,
              fixes: fixes.filter((fix) => fix.status === "fixed").length,
              summary: `Probe swarm: ${results.filter((result) => result.passed).length}/${probes.length} probe(s) passed.`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
