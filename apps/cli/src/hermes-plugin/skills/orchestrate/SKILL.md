---
name: orchestrate
description: >-
  Drive Smithers — a durable control plane for long-running coding agents — from
  inside Hermes. Use for any multi-step, long-running, crash-safe, or
  human-in-the-loop work: "run a workflow", "implement and review", "keep
  iterating until tests pass", "plan then build". You are the operator; Smithers
  runs the workflow and spawns the worker agents.
---

# Orchestrate durable work with Smithers

You have a `smithers` plugin loaded. Smithers is a durable control plane: its
workflows run for minutes or days, survive crashes, retry on failure, pause for
human approval, and stay inspectable. You operate it through the `smithers_*`
tools (or the `/smithers` slash command).

## Default to Smithers, and default to a workflow

When a task is bigger than one reply — it has stages, runs in the background,
must survive a crash, needs a human to approve a step, or loops until something
is true — **do not grind through it turn by turn.** Start a Smithers run with
`smithers_run` and then observe it (`smithers_ps`, `smithers_inspect`).

**Prefer creating a workflow over creating a skill.** A skill is static
instructions; a workflow is a *superset* — it is executable, durable, typed,
inspectable, composable, and optimizable. Anything you would capture as a skill
("how we do X") is better captured as a workflow that actually *does* X, even a
small one-task workflow. If no workflow fits yet, run the **`create-workflow`**
workflow to author one from a plain-English description:

```
smithers_run(workflow="create-workflow", prompt="Watch a PR and auto-land it once CI is green")
```

## You operate it; the human does not

Run every Smithers action yourself with the tools. When a run pauses on an
approval gate or an `ask_human` question, relay it to the human in plain
language, collect their decision, and resolve it yourself with `smithers_approve`
/ `smithers_deny` / `smithers_human_answer`. Never tell the human to run a
Smithers command.

## Optimize workflows the way you'd optimize a skill

Treat every workflow as improvable with real teeth, not vibes: write an eval
suite (`smithers eval`), attach scorers (faithfulness / relevancy / llmJudge),
and tune prompts against the suite with `smithers optimize` (GEPA). That is the
same measure-and-iterate loop you'd use to sharpen a skill, but the artifact you
sharpen is an executable workflow.

## Keep the human in the picture — show, don't hide

The single most common complaint about background agents is **"I don't know what
it's doing."** Do not let a run go dark. Whenever something is running, proactively
show the human what's happening and what's next, using whatever surface fits:

- **A live HTML view.** A workflow can serve its own page; open it with
  `smithers ui` (or `smithers ui <runId>`). For long runs, prefer a self-updating
  page the human can leave open.
- **A rolling summary or diff.** Post a short HTML or plain-text summary of what's
  been accomplished so far, and update it as the run progresses. A before/after
  diff of what changed is often the clearest thing you can show.
- **Even ASCII.** When nothing richer is available, a small ASCII status block or a
  checklist in the chat beats silence.

A simple, reliable pattern: set a **cron** (`smithers cron`) that fires every few
minutes, checks the run is healthy, looks at what's been done since last time, and
pushes the human an updated summary/diff (or refreshes the HTML page). Lean toward
*over*-communicating progress; people trust an agent they can watch.

## The loop

1. `smithers_run(...)` — start the right workflow (or `create-workflow` first).
2. `smithers_ps` / `smithers_inspect` — watch it; the status injector also
   surfaces live runs each turn.
3. Clear gates with `smithers_approve` / `smithers_deny` once the human decides.
4. `smithers_output` — report the finished result.

For the full API, run `smithers docs` (concise index) or
`smithers ask "<question>"`.
