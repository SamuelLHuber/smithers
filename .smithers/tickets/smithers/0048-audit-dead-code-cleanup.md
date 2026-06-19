# Dead code cleanup

> Target repo: **smithers** (this repo)
> Source: GitHub issue [#301](https://github.com/smithersai/smithers/issues/301) · 2026-06-16 bulletproof audit
> Triaged 2026-06-18 against `main` (post-#442 merge train): **2 of 66 resolved, 64 still open**

## Context

Unreachable functions, unused exports, dead branches, and obsolete files identified by the audit. Two findings (EngineError now reachable, five tagged-error classes now constructed) resolved; the rest remain. None of these are removed by the bugfix/test PRs.

Each item below is still open in current `main`. Text is the original audit finding (severity + file:line). `remaining:` notes come from the 2026-06-18 verification pass. Check items off here as they land, and mirror the check-off on issue #301.

## Open items

- [ ] **P2** Capability-registry factory exports are inconsistent: 4 of 10 re-exported from index, and those 4 are consumed nowhere — `packages/agents/src/index.js:48-58`
  - _remaining:_ 4 of the capability-registry factory re-exports remain inconsistent/unused via the barrel.
- [x] **P2** Orphaned type files: AskOptions.ts, InitWorkflowPackOptions.ts, InitWorkflowPackResult.ts, and a shebang-only index.d.ts — `apps/cli/src/AskOptions.ts, apps/cli/src/InitWorkflowPackOptions.ts, apps/cli/src/InitWorkflowPackResult.ts, apps/cli/src/index.d.ts`
  - _remaining:_ All four orphaned files still present.
- [ ] **P2** Dead MCP exports: registerSemanticTools and serveSemanticMcpServer — `apps/cli/src/mcp/semantic-server.js:11-21 (registerSemanticTools), 36-41 (serveSemanticMcpServer)`
  - _remaining:_ The genuinely-dead serveSemanticMcpServer export remains.
- [ ] **P1** Entire in-memory MetricsService in _coreMetrics.js is dead code (only the Tag is used) — `apps/observability/src/_coreMetrics.js:85-510`
  - _remaining:_ In-memory MetricsService body still dead.
- [ ] **P2** Dead in-memory recordEvent handles event types that don't exist in the SmithersEvent union — `apps/observability/src/_coreMetrics.js:359-479`
  - _remaining:_ Dead recordEvent still present.
- [ ] **P2** _coreMetrics.js catalog is reachable as a published deep import via the './*' subpath export, exposing a stale duplicate metric catalog — `apps/observability/package.json:18-22`
  - _remaining:_ Wildcard subpath export still exposes stale catalog.
- [x] **P2** bearerToken.ts is dead code — exported helper imported nowhere — `apps/review/src/server/bearerToken.ts`
  - _remaining:_ Exported helper still imported nowhere.
- [ ] **P2** Orphan jsx stub pages not in any navigation (jsx/installation.mdx, jsx/quickstart.mdx) — `docs/jsx/installation.mdx, docs/jsx/quickstart.mdx`
  - _remaining:_ Both jsx stub pages remain orphaned from navigation.
- [ ] **P1** Public export `accountToProviderEnv` is dead code with false JSDoc; logic duplicated in 3 places — `packages/accounts/src/accountToProviderEnv.js:1-48`
  - _remaining:_ Public export still dead in product (test-only).
- [ ] **P2** BaseCliAgent.stream() path is unused by the product and has no tests (buildStreamResult/emptyUsage/asyncIterableToStream) — ``
  - _remaining:_ Stream path remains unused-by-product/untested.
- [ ] **P2** Aspects accumulator + tracking config are render-time plumbing that the engine discards (dead data path) — `packages/components/src/aspects/AspectContext.js:22 (createAccumulator), packages/components/src/components/Aspects.js:27-37, packages/components/src/components/Task.js:300-309 (buildAspectMeta)`
  - _remaining:_ Render-time accumulator/tracking data path still discarded by engine.
- [x] **P2** aspects/index.js barrel is exported but imported by nothing — `packages/components/src/aspects/index.js:9`
  - _remaining:_ Barrel still imported by nothing.
- [ ] **P1** Entire in-memory storage module (storage/) is dead code — ``
  - _remaining:_ In-memory storage module still dead.
- [ ] **P1** Parallel duplicate implementations: output/, frame-codec/, internal-schema/index.js, loadInputEffect.js, loadOutputsEffect.js — ``
  - _remaining:_ Duplicate implementations not consolidated.
- [x] **P2** dialect.js exports isDialect and tableColumnsSql are never used — ``
  - _remaining:_ Both exports still unused.
- [ ] **P2** SmithersDb.buildEventHistoryWhere duplicates SqlMessageStorage logic but is SQLite-hardcoded and unused — ``
  - _remaining:_ Duplicate SQLite-hardcoded method still unused.
- [ ] **P2** react-output.js stripAutoColumns is a third copy of the same function — ``
  - _remaining:_ Third copy / duplication still present; not consolidated.
- [ ] **P2** Five package exports have no consumers anywhere in the repo (effectively dead public API) — `packages/devtools/src/index.js:18-23`
  - _remaining:_ All five exports still have no consumers.
- [ ] **P2** Server snapshotFromFrameRow constructs a SmithersDevToolsCore + captureSnapshot whose result is discarded — `packages/server/src/gatewayRoutes/getDevToolsSnapshot.js:334-335 (re: packages/devtools/src/SmithersDevToolsCore.js:33-37)`
  - _remaining:_ Discarded captureSnapshot call still present.
- [ ] **P2** loadCreateSession has an unreachable createSession branch and a dead relative-path fallback — `packages/driver/src/WorkflowDriver.js:22-23, 157-173`
  - _remaining:_ Unreachable createSession branch + relative-path fallback remain.
- [ ] **P1** Obsolete ~1759-line legacy engine body (runWorkflowBodyLegacy) is unreachable in production — `packages/engine/src/engine.js:5829-7587 (runWorkflowBodyLegacy); gate at 4624-4630`
  - _remaining:_ Legacy engine body still present.
- [x] **P2** deferred-bridge.js is entirely dead code (non-durable bridge superseded by durable variant) — `packages/engine/src/effect/deferred-bridge.js:1-64`
  - _remaining:_ Non-durable deferred-bridge.js still entirely dead.
- [ ] **P2** Dead exports in durable-deferred-bridge.js (Workflow + success schemas never consumed) — `packages/engine/src/effect/durable-deferred-bridge.js:19 (DurableDeferredBridgeWorkflow), 44 (approvalDurableDeferredSuccessSchema), 51 (waitForEventDurableDeferredSuccessSchema)`
  - _remaining:_ Dead exports still present.
- [ ] **P2** rpc-schema.js (SmithersRpcGroup + payload/result schemas) is published but has no implementation or consumer — `packages/engine/src/effect/rpc-schema.js:1-102`
  - _remaining:_ rpc-schema.js still published with no consumer.
- [ ] **P2** subscribeTaskWorkerDispatches is a published observability hook with no production consumer — `packages/engine/src/effect/single-runner.js:191-196 (re-exported via workflow-bridge.js:28 and index.js)`
  - _remaining:_ Observability hook still has no production consumer.
- [x] **P2** tagged.js is an orphan barrel — never imported anywhere — `packages/errors/src/tagged.js`
  - _remaining:_ Orphan barrel still imported nowhere.
- [ ] **P2** `approve` special-case in getRequiredScopeForGatewayMethod maps a method the runtime never dispatches (vestigial) — `packages/gateway/src/rpc/index.ts:744-746`
  - _remaining:_ Vestigial approve mapping still present.
- [ ] **P2** JsonSchema type declares anyOf/format/default/maximum fields that no schema sets and the test validator cannot check — `packages/gateway/src/rpc/index.ts:9-25`
  - _remaining:_ Unused JsonSchema fields still declared.
- [x] **P2** Stale empty src/index.d.ts is checked in and shipped — `packages/gateway-client/src/index.d.ts:1`
  - _remaining:_ Stale empty index.d.ts still checked in.
- [ ] **P2** Exported GatewayRequestFrame type is never imported or used anywhere — `packages/gateway-client/src/GatewayRequestFrame.ts:1`
  - _remaining:_ Exported type still never imported.
- [ ] **P2** Three exported gatewayKeys factories (cronList, nodeOutput, nodeDiff) are unused — `packages/gateway-client/src/sync/gatewayKeys.ts:16-24`
  - _remaining:_ Three gatewayKeys factories still unused in product.
- [ ] **P1** Two divergent extractors with a colliding name; legacy src/dom/extract.js is dead in product but still tested — `packages/graph/src/dom/extract.js (whole file; see TODO at lines 17-25)`
  - _remaining:_ Legacy extractor still dead in product but tested.
- [ ] **P2** src/utils/tree-ids.js is dead in production (only the legacy dom/extract.js uses it) — `packages/graph/src/utils/tree-ids.js`
  - _remaining:_ tree-ids.js still dead in production.
- [ ] **P2** Dead duplicate type exports: Scorer/ScorerBinding/SamplingConfig/ScorerFn/ScorerInput/ScoreResult/AgentLike/RetryPolicy/etc. — `packages/graph/src/types.ts:63-95,47-61,32-35 (+ Scorer.ts, ScorerBinding.ts, SamplingConfig.ts, ScorerFn.ts, ScorerInput.ts, ScoreResult.ts, AgentLike.ts, RetryPolicy.ts, MemoryNamespaceKind.ts, ExtractResult.ts)`
  - _remaining:_ Dead duplicate type exports remain.
- [ ] **P2** MemoryService / createMemoryLayer Effect layer and <Task memory> recall/remember are never wired into any runtime — `packages/memory/src/createMemoryLayer.js:11-30, packages/memory/src/MemoryService.js:1`
  - _remaining:_ MemoryService Effect layer still not wired into any runtime.
- [x] **P2** react-types.ts is dead code (zero references anywhere) — `packages/memory/src/react-types.ts:1`
  - _remaining:_ Dead file still present.
- [ ] **P2** Four exported config types have no consumers (speculative public API) — `packages/memory/src/WorkingMemoryConfig.ts, MessageHistoryConfig.ts, MemoryProcessorConfig.ts, SemanticRecallConfig.ts`
  - _remaining:_ Four speculative config types still have no consumer.
- [ ] **P2** `deprecated` is parsed but never used; OpenApiToolCalled event is typed/formatted but never emitted — `packages/openapi/src/extractOperations.js:45, apps/cli/src/format.js:280, packages/engine/src/index.d.ts:204`
  - _remaining:_ deprecated unused; OpenApiToolCalled still never emitted.
- [x] **P2** Committed generated src/index.d.ts is unreferenced by the exports map (dead generated artifact in source) — `packages/pi-plugin/src/index.d.ts`
  - _remaining:_ Committed generated index.d.ts still dead.
- [ ] **P2** DevToolsStore.retryNode and runSupportsRetry are effectively dead (no-op feature) — `packages/pi-plugin/src/runtime/DevToolsStore.ts:204,520-524`
  - _remaining:_ retryNode/runSupportsRetry still effectively no-op/dead.
- [ ] **P2** DevToolsClient.signal/resume/getNodeOutput/getNodeDiff are unused within the package — `packages/pi-plugin/src/runtime/DevToolsClient.ts:411-425,449-466`
  - _remaining:_ Four DevToolsClient methods still unused within the package.
- [ ] **P2** outputs.ts is entirely dead — exported types have zero consumers; server and db reimplement them — `packages/protocol/src/outputs.ts (whole file: OutputSchemaFieldType, OutputSchemaDescriptor, NodeOutputResponse)`
  - _remaining:_ outputs.ts still entirely dead (reimplemented elsewhere).
- [ ] **P2** ProtocolError type is exported but never consumed anywhere — `packages/protocol/src/errors.ts:51 (and duplicate at src/errors/ProtocolError.ts:6, re-exported via index.ts:22)`
  - _remaining:_ ProtocolError type still never consumed.
- [ ] **P2** DEVTOOLS_PROTOCOL_VERSION is exported but never read; both producer and consumers hardcode version: 1 — `packages/protocol/src/devtools.js:10 (DEVTOOLS_PROTOCOL_VERSION), re-exported index.ts:1`
  - _remaining:_ Constant still never read in production; version hardcoded.
- [ ] **P2** errors/*.ts type files are dead — shadowed by errors.ts in path resolution, never a consumer target — `packages/protocol/src/errors/DevToolsErrorCode.ts, NodeOutputErrorCode.ts, NodeDiffErrorCode.ts, JumpToFrameErrorCode.ts, ProtocolError.ts`
  - _remaining:_ Shadowed dead .ts type files remain.
- [ ] **P2** Duplicate ProtocolError definition: errors.ts and errors/ProtocolError.ts both define the identical shape independently — `packages/protocol/src/errors.ts:51-55 and packages/protocol/src/errors/ProtocolError.ts:6-10`
  - _remaining:_ Duplicate ProtocolError shape still defined twice.
- [x] **P2** Dead host-config method: prepareUpdate is never called by react-reconciler 0.33 — `packages/react-reconciler/src/reconciler.js:181-185`
  - _remaining:_ Dead prepareUpdate still present.
- [x] **P2** core-types.js is an orphaned re-export imported by nothing — `packages/react-reconciler/src/core-types.js:1`
  - _remaining:_ Orphan re-export still imported by nothing.
- [ ] **P2** SandboxHttpRunner / SandboxSocketRunner are dead pass-through re-exports — `packages/sandbox/src/effect/http-runner.js:108 (export const SandboxHttpRunner = HttpRunner); packages/sandbox/src/effect/socket-runner.js:93 (export const SandboxSocketRunner = SocketRunner)`
  - _remaining:_ Dead pass-through re-exports remain.
- [ ] **P2** process-runner.js exports normalizeSandboxEnv/Ports/Volumes but they are only used internally; their negative paths are untested — `packages/sandbox/src/effect/process-runner.js:67,109,143 (normalizeSandboxEnv, normalizeSandboxPorts, normalizeSandboxVolumes)`
  - _remaining:_ Over-exported, internal-only normalizers remain.
- [ ] **P2** sandboxEgressEnv NO_PROXY array branch is unreachable dead code — `packages/sandbox/src/egress.js:148`
  - _remaining:_ NO_PROXY array branch still unreachable.
- [ ] **P2** assertPathWithinRootEffect exported but only used internally — `packages/sandbox/src/sandboxPath.js:28`
  - _remaining:_ Exported but only used internally.
- [ ] **P2** Scheduler/WorkflowSession Effect Tags and SchedulerLive are dead provisioning (never consumed) — ``
  - _remaining:_ Dead provisioning unchanged (Tags provided but never consumed).
- [ ] **P2** ~9 session methods are dead in production; the package ships a much larger API than is used — ``
  - _remaining:_ Larger session API still ships beyond what's used.
- [ ] **P2** Dead file: src/react-types.ts is never imported anywhere — `packages/scorers/src/react-types.ts:1`
  - _remaining:_ Dead file still present.
- [ ] **P2** Public API (aggregateScores, runScorersBatch, relevancy/toxicity/faithfulness scorers) has no in-repo product consumer — `packages/scorers/src/index.js:18-28; packages/smithers/src/index.js:231`
  - _remaining:_ Cited scorer public API still has no in-repo product consumer.
- [ ] **P2** getNodeDiffRoute documents and destructures parameters it never uses (getCurrentPointerImpl, restorePointerImpl) — `packages/server/src/gatewayRoutes/getNodeDiff.js:260-262, 276-278`
  - _remaining:_ Documented/destructured-but-unused params remain.
- [ ] **P2** ConnectRequest declares a `{ password: string }` auth variant that is never implemented — `packages/server/src/ConnectRequest.ts:11-15`
  - _remaining:_ Unimplemented password auth variant still declared.
- [ ] **P1** Entire src/ide/ subtree is orphaned dead code (zero importers, zero tests, no docs) — `packages/smithers/src/ide/SmithersIdeService.js (433 lines), packages/smithers/src/ide/tools.js (95 lines), packages/smithers/src/ide/index.js, and 13 SmithersIde*.ts type files`
  - _remaining:_ Entire ide/ subtree still orphaned.
- [ ] **P1** VCS-tag write path (tagSnapshotVcs) is orphaned — the whole vcs-version read feature no-ops in production — `packages/time-travel/src/vcs-version/tagSnapshotVcsEffect.js:18; src/vcs-version/loadVcsTagEffect.js; src/vcs-version/rerunAtRevisionEffect.js`
  - _remaining:_ VCS-tag write path still orphaned.
- [ ] **P2** resolveWorkflowAtRevision has no production or internal consumer — `packages/time-travel/src/vcs-version/resolveWorkflowAtRevisionEffect.js:17; src/vcs-version/index.js:47`
  - _remaining:_ No consumer for resolveWorkflowAtRevision.
- [ ] **P2** formatDiffAsJson is an identity-spread export with no production caller — `packages/time-travel/src/diff.js:206-208`
  - _remaining:_ Identity-spread export still has no production caller.
- [ ] **P2** Declared dependency @smithers-orchestrator/errors is unused — `packages/usage/package.json:29`
  - _remaining:_ Declared dependency still unused.
- [ ] **P2** WorkspaceSnapshot.ts is orphaned dead code with documentation that diverges from (and is richer than) the authoritative inline typedef — `packages/vcs/src/WorkspaceSnapshot.ts:1-16`
  - _remaining:_ Orphaned divergent type file remains.

## Deferred to a focused PR (high-risk)

- **runWorkflowBodyLegacy (~1759 lines in engine.js)** is verified-dead in
  production (gated behind `__smithersEngineMode==='legacy'` / `SMITHERS_LEGACY_ENGINE=1`,
  set only by 3 engine tests), but removing it means surgically excising a
  1700+-line function from the 7775-line core engine file AND reworking
  `engine-legacy-mode.test.jsx` (delete) plus the legacy blocks in
  `aspects-budget.test.jsx` / `parallel-loop-advancement.test.jsx`. That risk
  profile warrants its own carefully-reviewed PR rather than a sweep commit.
