# Smithers 0.24.0 launch thread

Ready-to-post X/Twitter thread for the 0.24.0 release. Each tweet lists its media attachment. Shape: hook, then one capability per tweet with a concrete command, then proof and CTA.

Copy follows an anti-slop pass: no em-dashes, no "it's not X, it's Y" framing, no padding triads, no hedging. CLI invocations use `bunx smithers-orchestrator` throughout.

Scope note for whoever posts this: the camelCase output fix and stdout-truncation fix are bundled into one correctness-sweep tweet. Aspects budget fields and the agent-operated CLI docs framing appear in the proof tweet only.

---

### 1. Hook
**Media:** hero card

> Smithers 0.24.0 is here.
>
> `bunx smithers-orchestrator gateway` starts the full multi-run control plane headlessly: listRuns, streamRunEvents, streamDevTools, backed by the workspace database. No workflow run required. 🧵

Leads with the new command surface that most concretely unlocks the platform. A reader can run it today.

---

### 2. Workflow input schemas in inspect
**Media:** terminal screenshot of `bunx smithers-orchestrator inspect` showing a JSON schema block alongside the run summary

> `bunx smithers-orchestrator inspect` now returns the JSON schema for each workflow's input alongside the run summary.
>
> Generated skill docs surface real field names, types, defaults, enums, and descriptions. No more generic placeholders.

Concrete before/after: old placeholder versus real field names. Every agent integrating a workflow benefits.

---

### 3. Parallel loops, unblocked
**Media:** terminal capture showing parallel loop iterations advancing without waiting for the full run to go quiet

> Parallel `<Loop>` iterations stalled until the entire run graph went quiet. Fixed.
>
> The engine now advances ready loops whenever a loop node completes, without waiting for unrelated in-flight tasks to settle. Three scheduling paths changed together.

Names the exact failure mode, then the fix. Engine correctness is a trust signal.

---

### 4. Gateway streams detached runs
**Media:** terminal showing `bunx smithers-orchestrator up -d` followed by a Gateway client receiving real event frames

> `bunx smithers-orchestrator up -d` runs a workflow detached. Now the Gateway streams real events from those runs.
>
> A built-in out-of-process event bridge tails the events table for runs the Gateway host did not execute. No changes to your workflow or your detached runner.

Closes the gap between detached execution and Gateway observability. The last sentence handles the migration worry.

---

### 5. Init that works out of the box
**Media:** diff card showing old generated agents.ts (non-functional provider first) versus new agents.ts (Claude subscription provider first)

> `bunx smithers-orchestrator init` now generates a working agents.ts.
>
> The previous default led with non-functional providers. The generated file now leads with a working Claude subscription provider. If no usable provider is found, init fails with NO_USABLE_AGENTS.

Names what broke, names the fix, names the new failure mode. Fails loud instead of halfway.

---

### 6. Observability command, fixed
**Media:** terminal screenshot of `bunx smithers-orchestrator observability` starting the Docker Compose stack

> `bunx smithers-orchestrator observability` now ships its Docker Compose stack assets.
>
> The package was missing the stack files the CLI expected. The command finds them now, names Docker Compose explicitly in the prerequisite message, and the docs match.

Short. The fix is the news.

---

### 7. CLI correctness sweep
**Media:** terminal showing `bunx smithers-orchestrator output RUN_ID NODE_ID` returning a camelCase-keyed result correctly

> Two CLI fixes in 0.24.0:
>
> `bunx smithers-orchestrator output` now resolves camelCase output table keys instead of returning null.
>
> CLI agents overflowing the 200 KB stdout cap no longer return amnesiac results. The engine keeps the stream tail and prefers the completed answer.

Bundles two correctness fixes. Both affect anyone running the CLI against real workflows.

---

### 8. Proof and CTA
**Media:** hero card with version and changelog link

> Also in 0.24.0: CI gates restored, observability dts build fixed, Aspect budget fields marked declarative (not yet enforced), and the agent-operated CLI model documented across the guide and quickstart.
>
> Full changelog: https://smithers.sh/changelogs/0.24.0
> github.com/smithersai/smithers

Puts the housekeeping items where they belong. Closes with one link.

---

## Media manifest

| Tweet | Description | Source |
|-------|-------------|--------|
| 1 Hook | hero card | generated (design tokens) |
| 2 Inspect schemas | terminal screenshot of `bunx smithers-orchestrator inspect` with JSON schema visible | captured |
| 3 Parallel loops | terminal capture showing loop iterations advancing mid-run | captured |
| 4 Detached events | terminal: detached run start + Gateway client receiving event frames | captured |
| 5 Init fix | diff card: old agents.ts vs new agents.ts | generated (design tokens) |
| 6 Observability | terminal screenshot of `bunx smithers-orchestrator observability` | captured |
| 7 CLI output | terminal showing `bunx smithers-orchestrator output` returning a camelCase-keyed result | captured |
| 8 Proof/CTA | hero card with version and changelog link | generated (design tokens) |

**Regenerate cards:** edit `assets/_cards.html`, then run `node marketing/0.24.0/assets/_shoot.mjs` (Chromium screenshots each card at 2x).
