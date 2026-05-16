# Bun Port Workflow, Recast With Smithers

This is a runnable example workflow pack for rewriting Bun's Zig-to-Rust
migration harness with Smithers.

The Bun branch used a small JavaScript orchestration layer with `agent(...)`,
`pipeline(...)`, `parallel(...)`, ad hoc JSON schemas, and manual worktree
coordination. That shape maps directly to Smithers, but Smithers gives the
workflow first-class durability, typed state, inspection, worktrees, merge
queues, approvals, retries, observability, and time travel.

## Research Basis

I inspected Bun PR `#30412` through a sparse local checkout of
`refs/pull/30412/head` at commit `ed1a70f817`, focused on:

- `.claude/workflows/lifetime-classify.workflow.js`
- `.claude/workflows/phase-a-port.workflow.js`
- `.claude/workflows/phase-b1-tier.workflow.js`
- `.claude/workflows/phase-f-test-swarm.workflow.js`
- the rest of `.claude/workflows/*.workflow.js` for phase coverage
- `docs/PORTING.md` and `docs/LIFETIMES.tsv` from the public GitHub branch view

The key observation: Bun already built a compiler-like agent pipeline. Smithers
should not change that architecture. It should make it explicit, resumable,
queryable, and safer to operate.

## One-To-One Mapping

| Bun harness concept | Smithers concept |
| --- | --- |
| `agent(prompt, { schema })` | `<Task agent={...} output={outputs.someZodSchema}>` |
| `pipeline(items, a, b, c)` | `<Sequence>` plus `ctx.outputMaybe(...)` dependencies |
| `parallel([...])` | `<Parallel maxConcurrency={n}>` |
| hand-written JSON schemas | Zod schemas registered with `createSmithers(...)` |
| `phase("...")` and `log(...)` | run events, `logs`, `events`, `inspect`, node metadata |
| custom worktree agents | `<Worktree>` around a subtree of tasks |
| sequential cherry-picks | `<MergeQueue maxConcurrency={1}>` |
| retry loops in prompts | `<Loop maxIterations={...}>` plus task retries/timeouts |
| manual "kill and rerun" recovery | `up --resume`, `supervise`, stale attempt recovery |
| scattered result objects | persisted SQLite output tables |
| manual branch debugging | `timeline`, `fork`, `replay`, `revert`, `diff`, `hijack` |

## Implemented Workflow Pack

This directory contains the working example:

```text
examples/bun-port-smithers/
  agents.ts                     # dry-run agents by default, real CLI agents via env
  porting-rules.ts              # deterministic path, sampling, dedupe helpers
  porting-rules.test.ts         # helper tests
  schemas.ts                    # Zod output contracts for every workflow stage
  smithers.ts                   # shared createSmithers wrapper and DB path
  workflows/
    00-lifetime-classify.tsx
    01-phase-a-port.tsx
    02-crate-compile-bringup.tsx
    03-ungate-and-proper-port.tsx
    04-panic-probe-swarm.tsx
    05-test-swarm.tsx
    06-audit-sweeps.tsx
```

The agents default to deterministic dry-run implementations so the workflows can
be typechecked and smoke-tested without API keys or CLI subscriptions. Set
`BUN_PORT_SMITHERS_REAL_AGENTS=1` to use Smithers CLI agents for real porting
work.

## Production Pack Shape

Put the rewrite in a dedicated pack, for example:

```text
.smithers/bun-port/
  agents.ts
  schemas.ts
  porting-rules.ts
  prompts/
    lifetime-classify.mdx
    lifetime-verify.mdx
    phase-a-implement.mdx
    phase-a-verify.mdx
    phase-a-fix.mdx
    crate-check.mdx
    spec-verify.mdx
    test-area-fix.mdx
  workflows/
    00-lifetime-classify.tsx
    01-phase-a-port.tsx
    02-crate-compile-bringup.tsx
    03-ungate-and-proper-port.tsx
    04-panic-probe-swarm.tsx
    05-test-swarm.tsx
    06-audit-sweeps.tsx
```

Shared deterministic helpers should stay outside agent prompts:

- `rsPathFor(zigPath)` for Phase A output paths.
- crate tier and crate dependency graph loading.
- lifetime TSV parsing and writing.
- cargo error bucketing by crate, file, symbol, and diagnostic code.
- panic/test failure deduping by panic site or assertion fingerprint.
- test area manifests and worktree branch naming.

The agents should make semantic choices. The workflow code should own routing,
IDs, paths, schemas, throttling, and persistence.

## Phase Design

### 0. Lifetime Classification

Rewrite `lifetime-classify.workflow.js` as `00-lifetime-classify.tsx`.

Flow:

1. A compute task discovers pointer fields from the requested Zig files.
2. `<Parallel>` runs one classifier task per file.
3. A deterministic task selects all `UNKNOWN` or low-confidence rows plus a
   stable sample of high-confidence rows.
4. `<Parallel>` runs three verifier tasks per selected field.
5. A compute task synthesizes the final `LIFETIMES.tsv` rows and summary stats.
6. `<ApprovalGate>` pauses if the unknown rate exceeds a threshold.

Smithers improvements:

- Every field classification is a persisted row, not just a final blob.
- Sampling can be deterministic by field hash instead of `Math.random()`.
- Review votes are queryable by field, class, file, and agent.
- The final TSV can be regenerated from durable rows.
- Repeated runs can use memory for known ownership facts and prior verifier
  corrections.

### 1. Phase A File Port

Rewrite `phase-a-port.workflow.js` as `01-phase-a-port.tsx`.

Flow:

1. A compute task validates input files and computes exact `.rs` paths.
2. `<Parallel maxConcurrency={...}>` runs a per-file `<Sequence>`:
   implement, verify, and conditionally fix.
3. The implementer is a write-capable CLI agent with `read`, `grep`, `write`,
   and `edit`.
4. The verifier is read-only and adversarial.
5. The fixer receives only verifier findings and has edit-only scope.
6. A final report aggregates `clean`, `fixed`, `failed`, TODO counts, and
   confidence.

Smithers improvements:

- The implement, verify, and fix records are separate durable outputs.
- Task IDs are stable per Zig path, so failed files can be retried individually.
- `revert` can restore the exact workspace state from a bad attempt.
- `fork` can try a different model or prompt on one file without restarting the
  batch.
- `hijack` can hand a stuck CLI agent session to a human at the native CLI.

### 2. Crate Compile Bring-Up

Rewrite `phase-b1-tier.workflow.js` and the B0/B2 crate workflows as
`02-crate-compile-bringup.tsx`.

Flow:

1. A compute task loads crate tiers and dependency edges.
2. Tiers run sequentially; crates inside a tier run in `<Parallel>`.
3. Each crate gets a `<Loop maxIterations={25}>`:
   `cargo check`, classify errors, patch, and re-check.
4. Gate-and-stub is allowed only in this phase, with structured accounting for
   every gated module, stubbed symbol, and blocked upstream dependency.
5. `<ApprovalGate>` pauses before broad module gates or edits above a risk
   threshold.

Smithers improvements:

- Cargo errors become structured rows, so the frontier can be inspected and
  re-used by later phases.
- Gates and stubs are tracked as first-class debt.
- `continueOnFail` lets one crate fail without losing the tier result.
- Attempt snapshots make it practical to undo one bad crate patch.

### 3. Ungate, Proper Port, And Spec Verification

Rewrite Phase B2, D, and E workflows as `03-ungate-and-proper-port.tsx`.

Flow:

1. Survey tasks find gates, `todo!()`, `unimplemented!()`, slop patterns, and
   compile errors.
2. Work is split by crate, file, or line bucket.
3. Agents port real bodies from the Zig spec.
4. Two adversarial reviewers run in `<Parallel>` per changed module.
5. Fix tasks apply only confirmed bugs.
6. `<Loop>` repeats until there are no blocking gates or the max round count is
   reached.

Smithers improvements:

- Review votes and tiebreaks are typed rows instead of embedded JSON blobs.
- LLM-judge scorers can measure PORTING.md adherence over a sample.
- Time travel can fork a run at the frame before a risky ungate.
- Memory can store verified idiom decisions, such as "this Zig pattern maps to
  this Rust RAII shape."

### 4. Panic And Probe Swarms

Rewrite Phase C/E/F probe workflows as `04-panic-probe-swarm.tsx`.

Flow:

1. Build `bun_bin`.
2. Run a probe matrix in `<Parallel>`.
3. A compute task dedupes crashes by panic location, assertion text, signal, or
   timeout signature.
4. One fix task runs per unique root cause.
5. The probe loop repeats until the matrix is green or the cap is reached.

Smithers improvements:

- Probe output is persisted and diffable between iterations.
- Deduping is deterministic code, not prompt work.
- Long-running probe runs can be watched with `events`, `logs`, and metrics.
- Flaky probes can be marked `continueOnFail` while preserving evidence.

### 5. Test Swarm

Rewrite `phase-f-test-swarm.workflow.js` as `05-test-swarm.tsx`.

Flow:

1. A test area manifest defines the 24 subsystem areas.
2. `<Parallel maxConcurrency={...}>` starts one `<Worktree>` per area.
3. Each area runs a `<Loop>`:
   build, run focused tests, group failures, fix forward, rerun.
4. Once green, the worktree runs a bughunt pass comparing `.rs` files against
   `.zig` specs.
5. Approved area branches are converged through `<MergeQueue maxConcurrency={1}>`.

Smithers improvements:

- `<Worktree>` makes isolated area ownership a graph feature instead of a
  convention in a prompt.
- `<MergeQueue>` serializes cherry-picks and avoids accidental concurrent
  merges.
- `timeline --tree` shows every area branch and merge attempt.
- `replay --restore-vcs` can reproduce a failure with the same source revision.
- A human can approve partial areas before merge if the test result is not fully
  green but contains valuable shared-infra fixes.

### 6. Specialized Sweeps

Rewrite the unsafe, RAII, accessor, Windows, idioms, diff-review, and main-parity
workflows as reusable sweep components.

Each sweep should have this shape:

1. Survey deterministic candidates.
2. Classify each candidate with a read-only agent.
3. Patch only confirmed candidates.
4. Run two independent reviewers on high-risk edits.
5. Emit a compact report with fixed, skipped, rejected, and follow-up rows.

This avoids one-off workflow scripts for every audit category.

## Illustrative Smithers Skeleton

This is intentionally incomplete, but it shows the desired shape:

```tsx
/** @jsxImportSource smithers-orchestrator */
import {
  ApprovalGate,
  Loop,
  MergeQueue,
  Parallel,
  Sequence,
  Worktree,
  createSmithers,
} from "smithers-orchestrator";
import { z } from "zod";
import { codexPorter, readOnlyReviewer, mergeAgent } from "./agents";
import { rsPathFor, testAreas } from "./porting-rules";

const portFile = z.object({
  zig: z.string(),
  rs: z.string(),
  status: z.enum(["clean", "fixed", "failed", "skipped"]),
  confidence: z.enum(["high", "medium", "low"]),
  todos: z.number().int(),
  issuesFound: z.number().int().default(0),
});

const review = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({
    severity: z.enum(["must-fix", "should-fix", "nit"]),
    rule: z.string(),
    detail: z.string(),
    fix: z.string().optional(),
  })),
});

const lifetimeSummary = z.object({
  unknownRate: z.number(),
});

const gateDecision = z.object({
  approved: z.boolean(),
  note: z.string().nullable().optional(),
}).passthrough();

const areaResult = z.object({
  areaId: z.string(),
  allPass: z.boolean(),
  pass: z.number().int(),
  fail: z.number().int(),
  branch: z.string(),
  commits: z.array(z.string()),
});

const { Workflow, Task, smithers, outputs } = createSmithers({
  portFile,
  review,
  lifetimeSummary,
  gateDecision,
  areaResult,
  merge: z.object({
    areaId: z.string(),
    picked: z.number().int(),
    conflicts: z.number().int(),
  }),
});

function PhaseAFile({ file }: { file: { zig: string; loc: number } }) {
  const rs = rsPathFor(file.zig);
  return (
    <Sequence key={file.zig}>
      <Task id={`phase-a:${file.zig}:implement`} output={outputs.portFile} agent={codexPorter}>
        Port exactly one Zig file to Rust.
        Zig: {file.zig}
        Rust output: {rs}
        Read docs/PORTING.md and docs/LIFETIMES.tsv before writing.
      </Task>

      <Task id={`phase-a:${file.zig}:verify`} output={outputs.review} agent={readOnlyReviewer}>
        Verify {rs} against {file.zig} and docs/PORTING.md.
        Return only concrete PORTING.md violations.
      </Task>
    </Sequence>
  );
}

export default smithers((ctx) => {
  const files = ctx.input.files ?? [];
  const areas = ctx.input.areas ?? testAreas;
  const unknownRate = ctx.outputMaybe(outputs.lifetimeSummary, {
    nodeId: "lifetime:synthesize",
  })?.unknownRate ?? 0;

  return (
    <Workflow name="bun-zig-to-rust-port">
      <Sequence>
        <ApprovalGate
          id="lifetime-quality-gate"
          output={outputs.gateDecision}
          when={unknownRate > 0.05}
          request={{
            title: "Lifetime classifications have high UNKNOWN rate",
            summary: `UNKNOWN rate: ${unknownRate}`,
          }}
          onDeny="fail"
        />

        <Parallel maxConcurrency={ctx.input.phaseAConcurrency ?? 8}>
          {files.map((file: any) => <PhaseAFile key={file.zig} file={file} />)}
        </Parallel>

        <Parallel maxConcurrency={ctx.input.testConcurrency ?? 8}>
          {areas.map((area: any) => {
            const latestArea = ctx.latest("areaResult", `area:${area.id}:fix-tests`);
            return (
              <Worktree
                key={area.id}
                path={`.worktrees/bun-port-${area.id}`}
                branch={`bun-port/${area.id}`}
                baseBranch={ctx.input.baseBranch ?? "main"}
              >
                <Loop
                  id={`area:${area.id}:loop`}
                  until={latestArea?.allPass === true}
                  maxIterations={30}
                  onMaxReached="return-last"
                >
                  <Task id={`area:${area.id}:fix-tests`} output={outputs.areaResult} agent={codexPorter}>
                    Build bun_bin, run {area.glob}, fix forward in {area.crate}, and commit each fix.
                  </Task>
                </Loop>
              </Worktree>
            );
          })}
        </Parallel>

        <MergeQueue id="test-area-converge" maxConcurrency={1}>
          {areas.map((area: any) => (
            <Task id={`merge:${area.id}`} output={outputs.merge} agent={mergeAgent}>
              Cherry-pick approved commits for {area.id} onto the main integration branch.
            </Task>
          ))}
        </MergeQueue>
      </Sequence>
    </Workflow>
  );
});
```

## Operating The Workflow

Example commands for this example pack:

```bash
BUN_PORT_SMITHERS_DB=examples/bun-port-smithers/.tmp/runtime.db \
  bun run apps/cli/src/index.js up examples/bun-port-smithers/workflows/00-lifetime-classify.tsx \
  --input '{"files":[{"zig":"src/http/http.zig","crate":"http"}],"unknownApprovalThreshold":1}' \
  --run-id bun-port-lifetimes-001

BUN_PORT_SMITHERS_DB=examples/bun-port-smithers/.tmp/runtime.db \
  bun run apps/cli/src/index.js up examples/bun-port-smithers/workflows/01-phase-a-port.tsx \
  --input '{"files":[{"zig":"src/http/http.zig","loc":1200}],"repo":"."}' \
  --run-id bun-port-phase-a-001 \
  --max-concurrency 8

bunx smithers-orchestrator ps --watch
bunx smithers-orchestrator inspect bun-port-phase-a-001
bunx smithers-orchestrator logs bun-port-phase-a-001 --tail 100
bunx smithers-orchestrator timeline bun-port-phase-a-001 --tree
bunx smithers-orchestrator fork .smithers/bun-port/workflows/01-phase-a-port.tsx \
  --run-id bun-port-phase-a-001 \
  --reset-node 'phase-a:src/http/http.zig:implement' \
  --label try-alt-model
```

For long-running unattended runs:

```bash
bunx smithers-orchestrator up .smithers/bun-port/workflows/05-test-swarm.tsx \
  --input '{"baseBranch":"main","testConcurrency":12}' \
  --run-id bun-port-test-swarm-001 \
  --detach

bunx smithers-orchestrator supervise --interval 30s --stale-threshold 2m
```

For the test swarm, `useWorktrees` defaults to `true`. Keep it true for real
port work; set it false for local dry-run verification that should not create
git worktrees:

```bash
BUN_PORT_SMITHERS_DB=examples/bun-port-smithers/.tmp/runtime.db \
  bun run apps/cli/src/index.js up examples/bun-port-smithers/workflows/05-test-swarm.tsx \
  --input '{"useWorktrees":false,"areas":[{"id":"bun-http","glob":"test/js/bun/http/","crate":"runtime/server"}]}' \
  --run-id bun-port-test-swarm-smoke
```

## Verification

The local verification path is:

```bash
bun test examples/bun-port-smithers/porting-rules.test.ts
bun run typecheck:examples
```

Smoke-tested workflow runs use dry-run agents and one-file/one-crate inputs:

- `00-lifetime-classify.tsx`
- `01-phase-a-port.tsx`
- `02-crate-compile-bringup.tsx`
- `03-ungate-and-proper-port.tsx`
- `04-panic-probe-swarm.tsx`
- `05-test-swarm.tsx` with `useWorktrees:false`
- `06-audit-sweeps.tsx`

The default `05-test-swarm.tsx` graph was also rendered with `useWorktrees:true`
to verify that the Smithers graph contains a `<Worktree>` node and worktree
task metadata.

## Model And Tool Policy

Use least-privilege agents:

- Discover/survey tasks: compute tasks or cheap agents with `read`, `grep`, and
  `bash` only.
- Implement/fix tasks: Codex or Claude Code with `read`, `grep`, `write`,
  `edit`, and tightly scoped `bash`.
- Verify tasks: read-only tools only.
- Merge tasks: `bash`, `read`, and `grep`, inside `<MergeQueue>`.
- External side-effect tools, such as GitHub PR or issue creation, must use
  `defineTool({ sideEffect: true })` with idempotency keys.

Run two distinct models for high-risk review when possible. Bun's workflow
already used adversarial verification; Smithers makes multi-reviewer fan-out
and aggregation a normal graph pattern.

## What Smithers Improves

- Durability: completed tasks are not re-run after a crash.
- Inspectability: every phase output is typed, stored, and queryable.
- Resumability: `up --resume` and `supervise` replace custom restart logic.
- Work isolation: `<Worktree>` expresses area ownership in the graph.
- Merge safety: `<MergeQueue>` serializes convergence.
- Human control: `<ApprovalGate>` pauses on risky gates, high unknown rates, or
  partial test-swarm results.
- Time travel: `revert`, `fork`, `replay`, and `diff` make failed attempts
  debuggable instead of disposable.
- Tool accountability: built-in tool calls are logged per run, node, attempt,
  and iteration.
- Observability: `logs`, `events`, `inspect`, `node`, metrics, and OTEL exports
  make a multi-day port visible while it is running.
- Memory: verified porting facts and repeated bug patterns can survive across
  runs without bloating every prompt.
- Caching: expensive pure surveys and static analyses can be cached while
  downstream prompts evolve.

## Build Order

1. Implement shared schemas and deterministic helpers.
2. Port lifetime classification first, because Phase A depends on it.
3. Port Phase A file translation for small batches and verify output tables.
4. Add B1 crate compile bring-up with gate/stub accounting.
5. Add ungate/proper-port loops and spec verification.
6. Add panic/probe workflows.
7. Add the test swarm with `<Worktree>` and `<MergeQueue>`.
8. Convert specialized sweeps into reusable components.
9. Add dashboard queries, scorer sampling, and runbooks for operators.

The first useful milestone is not "all of Bun ports." It is one end-to-end run
over a small crate: lifetime classify, Phase A port, compile bring-up, ungate,
focused tests, and merge report, all visible in Smithers state.
