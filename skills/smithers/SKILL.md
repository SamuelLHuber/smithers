---
name: smithers
description: Drive Smithers — a durable control plane for long-running coding agents. Use when the user wants multi-step, long-running, crash-safe, or human-in-the-loop agent work: "orchestrate agents", "run a workflow", "implement this and review it", "keep iterating until tests pass", "plan then build", or anything that needs retries, approvals, replay, or evals across multiple AI steps. YOU (the agent) run Smithers on the user's behalf — it is not a GUI the human clicks.
---

# Smithers

Smithers is a durable control plane for long-running coding agents. Workflows are
TypeScript (JSX), run for minutes or days, and survive crashes — every finished
step is persisted to SQLite, so a restart resumes from the last completed node
instead of starting over. Retries, human approvals, replay, evals, and sandbox
review all live in one place.

## You drive it, not the human

This is the thing to internalize: **you, the AI agent, operate Smithers.** The
human asks for an outcome ("implement rate limiting and don't stop until the
tests pass"); you reach for Smithers, run the workflow, watch it, and report
back. Smithers spawns *other* agents (Claude Code, Codex, etc.) as the workers
inside a workflow — you are the operator standing at the control panel, not a
person clicking buttons in a UI.

So when a task is bigger than one prompt — it has stages, needs to survive a
crash, needs a human to approve a step, or needs to loop until something is
true — don't hand-roll it turn by turn. Run a Smithers workflow.

## 60 seconds to the aha

From inside the user's project (Bun ≥ 1.3, plus a model key like
`ANTHROPIC_API_KEY` in the env):

```bash
# 1. Scaffold .smithers/ with ready-made workflows (implement, review, plan, ralph, debug…)
bunx smithers-orchestrator init

# 2. Browse plain-English starters and their copy-paste commands
bunx smithers-orchestrator starters

# 3. Run one. This dispatches a real coding agent to do the work, durably.
bunx smithers-orchestrator workflow run implement --prompt "Add a /health endpoint"

# 4. Watch it
bunx smithers-orchestrator ps                 # active / paused / recent runs
bunx smithers-orchestrator logs <run-id> -f   # follow the event stream
```

That's the loop: scaffold → run a workflow → watch the run. The "aha" is step 3 —
you kicked off a multi-step agent job that you can crash, resume, fork, and
inspect, all from the CLI you already live in.

## The mental model

Smithers renders the workflow JSX tree every "frame." Each render answers one
question: *given what has already finished, what can run now?* Tasks produce
outputs validated by Zod schemas; the runtime persists them and renders again.
Crash mid-run and the next render picks up exactly where it left off — completed
nodes are never re-run.

```tsx
/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Sequence, Task } from "smithers-orchestrator";
import { z } from "zod";

const { Workflow, smithers, outputs } = createSmithers({
  analyze: z.object({ summary: z.string(), severity: z.enum(["low", "high"]) }),
  fix: z.object({ patch: z.string() }),
});

export default smithers((ctx) => (
  <Workflow name="bugfix">
    <Sequence>
      <Task id="analyze" output={outputs.analyze} agent={analyzer}>
        {`Analyze the bug: ${ctx.input.description}`}
      </Task>
      <Task id="fix" output={outputs.fix} agent={fixer}>
        {`Fix: ${ctx.output("analyze", { nodeId: "analyze" }).summary}`}
      </Task>
    </Sequence>
  </Workflow>
));
```

Core components: `<Workflow>` (root), `<Task>` (an AI or static step),
`<Sequence>` (ordered), `<Parallel>` (concurrent), `<Branch>` (conditional),
`<Ralph>` (loop until a condition is true — great for "keep fixing until the
reviewer approves"), plus approvals, signals, timers, sandboxes, and sub-flows.

```tsx
<Ralph until={ctx.latest("review")?.approved} maxIterations={5}>
  <Task id="implement" output={outputs.fix} agent={coder}>Fix based on feedback</Task>
  <Task id="review" output={outputs.review} agent={reviewer}>Review the implementation</Task>
</Ralph>
```

## Operating runs

Everything is a CLI verb (prefix with `bunx smithers-orchestrator` if it isn't on PATH):

```bash
smithers up workflow.tsx --input '{"description":"Fix bug"}'   # start a run
smithers up workflow.tsx --run-id <id> --resume true          # resume after a crash
smithers ps                                                   # list runs
smithers inspect <run-id>                                     # full run state
smithers logs <run-id> -f                                     # follow events
smithers approve <run-id> --node review                       # clear an approval gate
smithers cancel <run-id>                                      # stop a run
smithers eval workflow.tsx --cases evals/smoke.jsonl --suite smoke
```

When a workflow pauses on a human approval or question, the run is durable — it
waits. Resolve it with `smithers approve` / `smithers deny` / `smithers signal`
and the run continues from there.

## When to use Smithers vs. just answering

- **Use it** when order matters across steps, you need crash recovery, a human
  must approve mid-run, different steps need different models/tools, or you need
  to loop until something is true. Also when the user wants the work to keep
  going while they're away.
- **Skip it** for a single prompt → single response, or a quick one-off edit you
  can just do yourself. Smithers adds no value there.

## Full reference

This skill ships the complete docs next to it as **`llms-full.txt`** — read it
when you need the exact API: every component, the CLI catalog, the Gateway HTTP
API and browser console, memory, OpenAPI tools, evals, optimization, and the
full event union. You can also pull the latest copy any time:

```bash
bunx smithers-orchestrator docs-full      # prints llms-full.txt from smithers.sh
bunx smithers-orchestrator ask "How do I add a human approval gate?"
```

- Docs: https://smithers.sh
- Repo: https://github.com/smithersai/smithers
- npm package: `smithers-orchestrator`
