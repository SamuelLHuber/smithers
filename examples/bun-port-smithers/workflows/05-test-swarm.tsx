/** @jsxImportSource smithers-orchestrator */
import type { z } from "zod";
import { DEFAULT_TEST_AREAS, stableNodeId } from "../porting-rules";
import { mergeAgent, testAreaWorker } from "../agents";
import { createBunPortSmithers } from "../smithers";
import {
  mergeResultSchema,
  testAreaResultSchema,
  testSwarmInputSchema,
  testSwarmReportSchema,
} from "../schemas";

const { Workflow, Task, Sequence, Parallel, Loop, MergeQueue, Worktree, smithers, outputs } = createBunPortSmithers({
  input: testSwarmInputSchema,
  testAreaResult: testAreaResultSchema,
  mergeResult: mergeResultSchema,
  testSwarmReport: testSwarmReportSchema,
});
const KeyedLoop = Loop as any;

export default smithers((ctx) => {
  const areas = ctx.input.areas.length > 0 ? ctx.input.areas : DEFAULT_TEST_AREAS;
  type TestAreaResult = z.infer<typeof testAreaResultSchema>;
  type MergeResult = z.infer<typeof mergeResultSchema>;
  const results = (ctx.outputs.testAreaResult ?? []) as TestAreaResult[];
  const merges = (ctx.outputs.mergeResult ?? []) as MergeResult[];
  const allAreasHaveResult = results.length >= areas.length;
  const allMergesDone = allAreasHaveResult && merges.length >= areas.length;

  return (
    <Workflow name="bun-port-test-swarm">
      <Sequence>
        <Parallel maxConcurrency={ctx.input.maxConcurrency ?? 8}>
          {areas.map((area) => {
            const areaNodeId = stableNodeId(area.id);
            const latest = ctx.latest("testAreaResult", `test-swarm:${areaNodeId}:area`) as TestAreaResult | undefined;
            const branch = `bun-port/${area.id}`;
            const areaLoop = (
              <KeyedLoop
                key={area.id}
                id={`test-swarm:${areaNodeId}:loop`}
                until={latest?.allPass === true}
                maxIterations={ctx.input.maxIterations ?? 30}
                onMaxReached="return-last"
              >
                <Task
                  id={`test-swarm:${areaNodeId}:area`}
                  output={outputs.testAreaResult}
                  agent={testAreaWorker}
                  timeoutMs={30 * 60_000}
                >
                  OUTPUT_KIND: test-area
                  AREA: {area.id}
                  BRANCH: {branch}
                  CRATE: {area.crate}
                  REPO: {ctx.input.repo}

                  Build bun_bin, run tests under {area.glob}, group failures,
                  fix forward, bughunt against Zig specs, and commit each fix.
                </Task>
              </KeyedLoop>
            );
            return ctx.input.useWorktrees === false ? areaLoop : (
              <Worktree
                key={area.id}
                path={`.worktrees/bun-port-${area.id}`}
                branch={branch}
                baseBranch={ctx.input.baseBranch ?? "main"}
              >
                {areaLoop}
              </Worktree>
            );
          })}
        </Parallel>

        {allAreasHaveResult ? (
          <MergeQueue id="test-swarm:merge-queue" maxConcurrency={1}>
            {areas.map((area) => (
              <Task
                key={area.id}
                id={`test-swarm:${stableNodeId(area.id)}:merge`}
                output={outputs.mergeResult}
                agent={mergeAgent}
                timeoutMs={15 * 60_000}
              >
                OUTPUT_KIND: merge
                SUBJECT: {area.id}
                BRANCH: bun-port/{area.id}

                Cherry-pick commits for {area.id} onto the integration branch.
                Resolve conflicts only by preserving the version that keeps the
                area build and test command green.
              </Task>
            ))}
          </MergeQueue>
        ) : null}

        {allMergesDone ? (
          <Task id="test-swarm:report" output={outputs.testSwarmReport}>
            {{
              areas: areas.length,
              allPass: results.filter((result) => result.allPass).length,
              partial: results.filter((result) => !result.allPass).length,
              merged: merges.reduce((sum, merge) => sum + merge.picked, 0),
              summary: `Test swarm: ${results.filter((result) => result.allPass).length}/${areas.length} area(s) all-pass.`,
            }}
          </Task>
        ) : null}
      </Sequence>
    </Workflow>
  );
});
