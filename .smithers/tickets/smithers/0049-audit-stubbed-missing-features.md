# Stubbed & missing features — remaining

> Target repo: **smithers** (this repo)
> Source: GitHub issue [#302](https://github.com/smithersai/smithers/issues/302) · 2026-06-16 bulletproof audit
> Triaged 2026-06-18 against `main` (post-#442 merge train): **9 of 17 resolved, 8 still open**

## Context

Documented features that still ship as no-op stubs or are missing. Memory token-limiting/summarization, semantic-MCP time-travel tools, openapi generate, non-JSON bodies, scorer context/groundTruth, and the gui shortcut all landed; these remain.

Each item below is still open in current `main`. Text is the original audit finding (severity + file:line). `remaining:` notes come from the 2026-06-18 verification pass. Check items off here as they land, and mirror the check-off on issue #302.

## Open items

- [ ] **P1** AmpAgent cannot resume a session — it is the only CLI adapter that never wires resumeSession into buildCommand — `packages/agents/src/AmpAgent.js:196-240, packages/agents/src/AmpAgentOptions.ts`
  - _remaining:_ buildCommand must read params.options?.resumeSession and emit `amp threads continue <id>` per the manifest; add session field to AmpAgentOptions. Still unimplemented.
- [ ] **P2** Several documented remote sandbox targets (gVisor, Daytona, Cloudflare) have no shipped or example provider — `docs/index.mdx:240-241, README.md:170-174, packages/sandbox/src/`
  - _remaining:_ Ship example providers (or links) for gVisor/Daytona/Cloudflare, or trim README/docs to the targets that actually have a provider. Still a documented-but-absent surface.
- [ ] **P2** `smithers memory` and `smithers cron` CLI groups are partial vs their underlying store/adapter capabilities — `apps/cli/src/index.js:2230-2328`
  - _remaining:_ Add `memory get`, `memory set`, `memory rm` wrapping store.getFact/setFact/deleteFact. Memory CLI still partial; cron resolved.
- [ ] **P2** ./BaseCliAgent subpath export declares types target missing its runtime exports — ``
  - _remaining:_ Emit a dedicated ./src/BaseCliAgent/index.d.ts re-exporting the module symbols and set it as the subpath's types. Helper imports still untyped.
- [ ] **P2** SuperSmithers 'apply' task is a no-op stub that returns a literal and writes nothing — `packages/components/src/components/SuperSmithers.js:74-91`
  - _remaining:_ Implement the compute fn to read prior propose-task output and apply edits to disk (or gate behind dryRun), or document as report-only. Still a no-op stub.
- [ ] **P1** AlertRuntime is a no-op stub; alertPolicy.rules are never evaluated and no alert is ever inserted — `packages/engine/src/alert-runtime.js:7-22; wired at packages/engine/src/engine.js:5488-5514 and 6059-6088`
  - _remaining:_ Implement start()/stop() to subscribe to the eventBus, evaluate policy.rules, and insertAlert/createHumanRequest on fire. Still a no-op stub.
- [ ] **P2** alertPolicy.reactions are never consumed anywhere (entire alert reaction pipeline unimplemented) — ``
  - _remaining:_ On rule fire, look up policy.reactions and execute (requestCancel/pause/createHumanRequest) via the injected services. Still unimplemented.
- [ ] **P1** 10 live runtime RPC methods are absent from the canonical GATEWAY_RPC_DEFINITIONS contract (real drift, opposite of the prompt's premise) — `packages/gateway/src/rpc/index.ts:397-707`
  - _remaining:_ Add these live methods (or an internal contract section) to GATEWAY_RPC_DEFINITIONS so every dispatched method is contracted. Drift remains.
