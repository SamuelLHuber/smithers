# Quota-aware pause & resume (don't burn retries on usage-limit errors)

> Target repo: **smithers** (this repo)
> Source: GitHub issue [#324](https://github.com/smithersai/smithers/issues/324) · found running `.smithers/workflows/fix-all-issues.tsx`
> Status 2026-06-18: **open, not started.** Related: [[0054-degraded-partial-failure-run-status]].

## Problem

When an agent provider returns a **usage-limit / quota** error (e.g. Codex on a ChatGPT subscription: `You've hit your usage limit … try again at Jun 18th, 2026 9:54 AM`), Smithers treats it like any task failure: it burns the task's `retries` immediately (each attempt fails in ~3s), and with `continueOnFail` + `<Loop onMaxReached="return-last">` the work item silently converges to "no PR / not done." A large fan-out then quietly degrades — many items produce nothing — and combined with #295 the run can still report `succeeded`.

Observed running fix-all-issues 8-wide: the ChatGPT Codex quota was exhausted ~50 min in; within minutes the log had 20 `hit your usage limit` errors and every subsequent Codex `fix`/`review-codex` task failed in ~3s, burning its retries. The run had to be cancelled (12 PRs landed, ~477 steps pending) to preserve state; otherwise the ~120 pending items would have churned their loop/retry budgets to no-PR and been unrecoverable on resume (loops would hit `maxIterations`).

A quota error is **transient and resumable** (it even carries a concrete reset time), unlike a logic failure. Smithers already short-circuits retries for auth errors (`task.mdx`: "Auth errors short-circuit retries"); usage-limit errors should be handled at least as gracefully.

## Suggested solution

- [ ] Detect provider usage-limit/rate/quota errors (parse the reset time when present) and **do not** consume the task's `retries`.
- [ ] Prefer **pausing the run** into a durable, resumable state — a dedicated status (e.g. `waiting-quota`) with the reset time surfaced — rather than failing the task, so `smithers up --run-id … --resume true` after the reset completes the remaining work instead of leaving silently-skipped items.
- [ ] At minimum, back off / requeue rather than spin through every task at the failure rate.
- [ ] Surface an aggregate "N tasks blocked on provider quota" signal (ties into [[0054-degraded-partial-failure-run-status]]).

## Acceptance

- [ ] A usage-limit error does not decrement `retries` and does not converge a `<Loop>` item to no-PR.
- [ ] The run can durably pause on quota exhaustion and resume cleanly after the reset time.
- [ ] An aggregate quota-blocked count is observable (CLI/inspect).
