# Code cleanup & refactors — remaining

> Target repo: **smithers** (this repo)
> Source: GitHub issue [#307](https://github.com/smithersai/smithers/issues/307) · 2026-06-16 bulletproof audit
> Triaged 2026-06-18 against `main` (post-#442 merge train): **23 of 48 resolved, 25 still open**

## Context

Lower-value cleanups the refactor PRs (#400/#401/#402/#403/#405) did not reach: duplicated helper consolidation, inline-vs-shared type tables, barrel-shim collapse, redundant aliases, Effect ceremony removal, and `Record<string,any>` public typings.

Each item below is still open in current `main`. Text is the original audit finding (severity + file:line). `remaining:` notes come from the 2026-06-18 verification pass. Check items off here as they land, and mirror the check-off on issue #307.

## Open items

- [ ] **P2** OpenCodeAgent is the only adapter with a hand-maintained .ts declaration file instead of the standard XAgentOptions.ts pattern — `packages/agents/src/OpenCodeAgent.ts (+ OpenCodeAgent.js)`
  - _remaining:_ No OpenCodeAgentOptions.ts; still the only adapter with a hand-written declare file. Not converted to standard pattern.
- [ ] **P2** Detached spawn path resolution is inconsistent (`.pathname` vs fileURLToPath) — `apps/cli/src/index.js:1649 and 2902 vs apps/cli/src/resume-detached.js:17`
  - _remaining:_ Spawn paths not converted to fileURLToPath; inconsistency remains.
- [ ] **P2** runDevtoolsCommandWithTelemetry is called for snapshots/restore despite its `cmd` type being tree|diff|output|rewind — `apps/cli/src/index.js:2606 (JSDoc), 4978 (snapshots), 5006 (restore), 2589 (DEVTOOLS_COMMANDS)`
  - _remaining:_ Partially widened (snapshots added) but 'restore' still missing from JSDoc/DEVTOOLS_COMMANDS; type/contract mismatch persists.
- [x] **P2** Redaction 'secret-ish' rule carries a misleading dead replace:'' field — `apps/observability/src/_traceRedaction.js:27-31`
  - _remaining:_ Dead/misleading replace field not removed.
- [ ] **P2** Public makeSmithersSpanAttributes and the internal _coreTracing.js copy can silently diverge — only the standalone file uses the shared alias table — `apps/observability/src/_coreTracing.js:32-59`
  - _remaining:_ Inline copy persists; can still silently diverge from the shared/public table.
- [ ] **P2** Inconsistent host-prop sanitization across structural components — `packages/components/src/components/Branch.js:11, Sequence.js:8, Ralph.js:13, Workflow.js:9 vs Parallel.js:11-16, MergeQueue.js:11-16`
  - _remaining:_ Sanitization still inconsistent across structural components.
- [ ] **P2** tsconfig outDir/declaration cruft conflicts with tsup build target — `packages/components/tsconfig.json:18-20 vs tsup.config.ts:5-6`
  - _remaining:_ tsconfig outDir/declaration cruft still conflicts with tsup target.
- [x] **P2** SMITHERS_NODE_ICONS uses the same '⚡' glyph for both 'task' and 'parallel' — `packages/devtools/src/SMITHERS_NODE_ICONS.js:6,8`
  - _remaining:_ parallel still not given a distinct glyph.
- [x] **P2** printTree prints props.name/props.id without type-narrowing (Record<string,unknown> values) — `packages/devtools/src/printTree.js:24-29`
  - _remaining:_ No type-narrowing added.
- [ ] **P2** Confusing snapshot-handle defaults: public snapshot() hardcodes source 'watch'/tier 2 while its comment says Tier 1/wrap — `packages/engine/src/startDurability.js:125-127 (and undocumented withSocket/createSocketServer options at 77-78)`
  - _remaining:_ Default/comment mismatch and undocumented options both remain.
- [ ] **P2** Duplicated helper functions copy-pasted across files (isObject x3, isGatewayResponseFrame x2 identical, withoutVirtualFields x3, asRecord x2) — `packages/gateway-client/src/SmithersGatewayConnection.ts:50-63`
  - _remaining:_ No shared internal module; helpers still copy-pasted across files.
- [x] **P2** useGatewayRunTree casts node status to NodeStatus despite the source type being plain `string` — `packages/gateway-react/src/sync/useGatewayRunTree.ts:57`
  - _remaining:_ Unchecked widening-to-narrow cast remains.
- [x] **P2** src/extract.js re-declares shared constants instead of importing constants.js (drift risk) — `packages/graph/src/extract.js:11-12`
  - _remaining:_ Constants re-declared, not imported from ./constants.js; drift risk persists.
- [x] **P2** DevToolsClient.toWsUrl has a no-op pathname assignment — `packages/pi-plugin/src/runtime/DevToolsClient.ts:91`
  - _remaining:_ No-op pathname assignment not removed.
- [ ] **P2** Inconsistent subpath module layout between /devtools and /errors — `packages/protocol/src/devtools.js + devtools/*.ts vs src/errors.ts + errors/index.js + errors/*.ts`
  - _remaining:_ Two different conventions for sibling subpaths remain.
- [x] **P2** DevToolsNodeType union is duplicated inline in index.d.ts instead of being a single declared type — `packages/protocol/src/index.d.ts:1 vs src/devtools/DevToolsNodeType.ts:1-17`
  - _remaining:_ Duplicated union literal; two sources of truth remain.
- [ ] **P2** directorySize misnamed and dangling WalkResult typedef — `packages/sandbox/src/execute.js:106-113 (directorySize); packages/sandbox/src/bundle.js:19 (@returns {Promise<WalkResult>})`
  - _remaining:_ Neither the misnaming nor the dangling typedef addressed.
- [ ] **P2** Request README writes confusing/empty runtime field on provider path — `packages/sandbox/src/execute.js:417-423`
  - _remaining:_ Confusing/empty runtime field on provider path unchanged.
- [ ] **P2** Approval 'continue' path stores resolution as output without usage; cache/output shape inconsistency — ``
  - _remaining:_ Output shape not normalized to standard TaskOutput (no usage). Low severity per audit.
- [ ] **P2** Redundant two-layer barrel shims (create-scorer.js, builtins.js) duplicate the real implementation files — `packages/scorers/src/create-scorer.js:6-7; packages/scorers/src/builtins.js:1-5`
  - _remaining:_ Two-layer barrel shims not collapsed into index.js.
- [x] **P2** asStringRecord is a redundant one-line alias of asObject — `packages/server/src/gateway.js:596-601`
  - _remaining:_ Redundant alias not removed.
- [x] **P2** JUMP_RUN_ID_PATTERN / JUMP_MAX_FRAME_NO exported from subpath but absent from main barrel and index.d.ts — `packages/time-travel/src/jumpToFrame.js:21-22; src/index.js:46; src/index.d.ts`
  - _remaining:_ Constants still missing from main barrel + types (only reachable via subpath).
- [ ] **P2** Public type surface is Record<string,any> — direct importers of the package get zero type safety — `packages/tool-context/src/index.d.ts:12-26`
  - _remaining:_ Public type surface still Record<string,any>; zero type safety for importers.
- [x] **P2** package.json ./* subpath export maps every subpath's types to index.d.ts (latent mis-mapping, currently unused) — `packages/tool-context/package.json:13-17`
  - _remaining:_ Latent ./* types mis-mapping not fixed.
- [ ] **P2** findVcsRoot is wrapped in Effect.sync but every consumer immediately Effect.runSync's it — pure ceremony with no Effect benefit — `packages/vcs/src/find-root.js:12-29 ; packages/engine/src/engine.js:709,733,1697`
  - _remaining:_ Effect ceremony not removed; not converted to a plain sync function.
