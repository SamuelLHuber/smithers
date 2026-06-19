# Test coverage gaps — remaining

> Target repo: **smithers** (this repo)
> Source: GitHub issue [#306](https://github.com/smithersai/smithers/issues/306) · 2026-06-16 bulletproof audit
> Triaged 2026-06-18 against `main` (post-#442 merge train): **32 of 90 resolved, 58 still open**

## Context

Coverage gaps across apps/gateway/UI/e2e/examples. The #352–#404 test wave closed 32; these 58 remain — dominated by untested OTLP/observability layers, review drivers, fabricated/skip-only e2e fault cases (several blocked on jjhub/0002), examples CI gating, partially-covered gateway-react sync branches, and operator-UI/UI-pack drift guards.

Each item below is still open in current `main`. Text is the original audit finding (severity + file:line). `remaining:` notes come from the 2026-06-18 verification pass. Check items off here as they land, and mirror the check-off on issue #306.

## Open items

- [ ] **P2** Real-CLI e2e exists for only 2 of 10 CLI engines (OpenCode, Vibe); the other 8 are proven only via fake-binary subprocess tests — `packages/agents/tests/opencode-e2e.test.js, packages/agents/tests/vibe-agent-e2e.test.js`
  - _remaining:_ No real-CLI e2e added for the other 8 engines (amp, antigravity, claude, codex, gemini, forge, pi, kimi/hermes); they remain fake-binary subprocess only
- [ ] **P2** MCP revert_attempt tool handler is untested — `apps/cli/src/mcp/semantic-tools.js:1185-1209`
  - _remaining:_ revert_attempt MCP handler still has no test in semantic-tools-unit.test.js or semantic-mcp.test.js
- [ ] **P2** Contract test does not cover every command that advertises JSON output (rewind omitted despite being handled) — `apps/cli/tests/json-stdout-contract.test.js:151-160`
  - _remaining:_ rewind not added to the json-stdout-contract command coverage
- [ ] **P2** OTLP integration entry points (createSmithersOtelLayer/ObservabilityLayer/RuntimeLayer) have no tests — `apps/observability/src/createSmithersObservabilityLayer.js:46-49`
  - _remaining:_ OTLP integration entry-point layers still have no tests
- [x] **P2** _traceEventNormalizers.js: shared/generic normalizer and provider-correlation paths largely untested — `apps/observability/src/_traceEventNormalizers.js:306-397`
  - _remaining:_ shared/generic normalizer and provider-correlation paths still untested
- [x] **P2** OTLP severity edge cases untested: truncated-json-stream WARN and session error/warning inference — `apps/observability/src/_otelLogBuilders.js:60-92`
  - _remaining:_ The two cited OTLP severity edge cases remain untested
- [x] **P2** renderPrometheusMetrics Frequency and Summary metric-state branches untested — `apps/observability/src/renderPrometheusMetrics.js:172-188`
  - _remaining:_ renderPrometheusMetrics Frequency (src:172-178) and Summary (src:179-188) MetricState branches still untested
- [ ] **P2** Non-streaming JSON metering and srk_ api-key proxy branches untested — `apps/review/src/server/proxy/handleAnthropic.ts:131-146, authenticateProxyRequest.ts:71-75`
  - _remaining:_ Non-streaming JSON metering and srk_ api-key proxy authentication branches remain uncovered
- [ ] **P2** CLI entrypoint and GitHub Action drivers have no tests — `apps/review/src/cli/main.ts, apps/review/src/cli/parseReviewArgs.ts, apps/review/action/src/runAction.ts, runGate.ts, runReview.ts, fetchOidcToken.ts`
  - _remaining:_ main.ts, parseReviewArgs.ts, runAction.ts, runGate.ts, runReview.ts, fetchOidcToken.ts still have no direct tests
- [x] **P2** Several pure walkthrough helpers lack direct unit tests — `apps/review/src/walkthrough/classifyChangeRole.ts, buildNarratePrompt.ts, describeChange.ts, escapeHtml.ts, src/diffs/renderFallbackDiffHtml.ts, src/workflow/normalizeReviewInput.ts, writeOpenAiSchemaFile.ts`
  - _remaining:_ None of the seven pure walkthrough helpers have direct unit tests
- [ ] **P2** /api/admin/usage endpoint untested — `apps/review/src/server/admin/handleAdminUsage.ts`
  - _remaining:_ /api/admin/usage endpoint (handleAdminUsage) still untested
- [ ] **P1** Nightly soak CI gate (120-min budget) runs effectively one fabricated-transport test; cases 29 and 30 are permanently skipped — `e2e/faults/case28-soak-live-stream-rss.test.ts:4,86,212; e2e/faults/case29-soak-cron-2h-no-stuck.test.ts:7; e2e/faults/case30-soak-jjhub-long-lived.test.ts:7; .github/workflows/faults-nightly.yml`
  - _remaining:_ Soak gate still effectively one fabricated-transport test; cases 29 and 30 remain skip-only stubs blocked on jjhub/0002
- [ ] **P1** Six fault cases are empty skip-only stubs — entire feature areas have zero fault/e2e coverage — `e2e/faults/case19,case20,case21,case22 (each line 5-7); e2e/faults/case02-kill-sandbox-engine-alive.test.ts:189`
  - _remaining:_ Six fault cases (19,20,21,22 + case02 dual-heartbeat + the soak stubs) remain empty skip-only stubs
- [ ] **P2** workflow-ui-all e2e depends on a retired POC (apps/smithers-studio-2) for its Chromium binary — `apps/cli/tests/workflow-ui-all.e2e.test.js:43,59`
  - _remaining:_ e2e still depends on retired POC apps/smithers-studio-2 for its Chromium binary
- [ ] **P2** case08 inspector and case24 replay-safety are hybrids: real predicate called against fabricated storage — `e2e/faults/case08-inspector-never-idle.test.ts:3,62,277; e2e/faults/case24-replay-unsafe-approval.test.ts:3,189-248,443`
  - _remaining:_ case08 and case24 remain hybrids — real predicate against fabricated in-memory storage; not booted through the real product path
- [ ] **P2** Reconnect-afterSeq / ws-drop / webhook behaviors are fabricated in e2e/faults but exist as real (non-e2e) tests elsewhere — duplicate-but-fake instead of promoting the real ones — `e2e/faults/case09-reconnect-afterseq.test.ts; case15-ws-drop-reconnect.test.ts; case17-webhook-bad-signature.test.ts; e2e/budgets/latency.json`
  - _remaining:_ case09 and case15 reconnect/ws-drop behaviors are still fabricated in e2e/faults rather than promoting the real non-e2e tests
- [ ] **P2** e2e package.json omits the smithers-orchestrator dependency that case25 imports, so the real-gateway e2e relies on hoisting — `e2e/package.json; e2e/faults/case25-approval-scope-denial.test.ts:7`
  - _remaining:_ e2e/package.json still omits the smithers-orchestrator dependency; case25 relies on workspace hoisting
- [ ] **P2** OpenAPI 'e2e' test mocks globalThis.fetch, so it is not a strict no-mock e2e — `packages/openapi/tests/e2e.test.js:9-18,30-42`
  - _remaining:_ OpenAPI 'e2e' still mocks globalThis.fetch — not a strict no-mock e2e
- [ ] **P1** Neither 'examples smoke test' actually exercises the examples/ tree — both only scan docs/** — `apps/cli/tests/docs-examples-smoke.test.js:155`
  - _remaining:_ Neither smoke test exercises the examples/ tree; both only scan docs
- [x] **P2** examples/ tree (108 workflows) is in NO CI gate — typecheck:examples script exists but is never invoked — `.github/workflows/ci.yml:34`
  - _remaining:_ examples/ tree still in NO CI gate; typecheck:examples never invoked
- [ ] **P2** examples/tsconfig.json points smithers-orchestrator at src/*.js source, not the published package — typecheck:examples does not validate against shipped types — `examples/tsconfig.json`
  - _remaining:_ examples tsconfig still points at src/*.js source, not the published package; does not validate against shipped types
- [x] **P2** AntigravityAgent stream-json interpreter is untested and effectively dead in practice — ``
  - _remaining:_ AntigravityAgent stream-json interpreter/output-parsing still untested
- [ ] **P2** Observability metric emission path has no test assertions — ``
  - _remaining:_ Agent observability/metric emission path still has no test assertions
- [x] **P2** extractTextFromJsonValue (widely-used recursive util) has a single test case — ``
  - _remaining:_ Still single-case; recursive/branch coverage not added
- [ ] **P2** createMcpToolset include filter and callMcpTool error/structured-content branches untested — ``
  - _remaining:_ createMcpToolset include filter and callMcpTool error/structured-content branches still untested
- [x] **P2** DevToolsRunStore: verbose logging, unknown-event recording, orphan ToolCallFinished, and getTaskState-miss branches are untested — `packages/devtools/src/DevToolsRunStore.js:68-77,119-142,183-189` — added 5 tests: getTaskState misses (unknown run, unknown node, missing iteration), orphan ToolCallFinished no-op, unknown-event recording (run created + event retained, no task mutation), and verbose-mode lifecycle logging. 88 devtools tests green.
  - _remaining:_ Verbose logging, unknown-event recording, orphan ToolCallFinished, and getTaskState run-miss branches all still untested
- [x] **P2** snapshotSerializer: top-level non-plain values and anonymous-class instances are untested boundary cases — `packages/devtools/src/snapshotSerializer.js:88-106` — added tests for top-level bigint/function/symbol(±description)/Date(valid+invalid), a top-level named-class instance (`[Ctor]` + UnsupportedType warning at path `$`), and an anonymous-class instance (empty ctor name → walked as its own enumerable keys). 84 devtools tests green.
  - _remaining:_ Top-level non-plain value and anonymous-class instance boundary cases still untested
- [ ] **P2** diffSnapshots p95 timing assertion is a CI-flaky unit test — `packages/devtools/tests/diffSnapshots.test.ts:7,236-253`
  - _remaining:_ CI-flaky p95 wall-clock timing assertion still present, not removed/made deterministic
- [ ] **P2** rpc-contract.test.ts example validation is schema self-validation, not a round-trip; near-tautological for opaque response schemas — `packages/gateway/tests/rpc-contract.test.ts:191-198`
  - _remaining:_ Still tautological self-validation, not a real serialize→deserialize round-trip
- [ ] **P2** generate-openapi.ts has zero test coverage despite emitting the published contract artifact and shipping in `files` — `packages/gateway/scripts/generate-openapi.ts:1-265`
  - _remaining:_ scripts/generate-openapi.ts still has zero test coverage
- [ ] **P2** TS *Request/*Response types and JsonSchema definitions are maintained in parallel with no agreement test — `packages/gateway/src/rpc/index.ts:93-267`
  - _remaining:_ No test asserts TS *Request/*Response types agree with the JsonSchema definitions
- [ ] **P2** objectSchema(additionalProperties) supports a sub-schema type per JsonSchema, but no definition ever uses it and the OpenAPI generator/validator paths for it are untested — `packages/gateway/src/rpc/index.ts:276-287`
  - _remaining:_ The objectSchema additionalProperties sub-schema path is still unused, and the generator/validator paths for it are untested
- [ ] **P2** Untested error/auth/reconnect branches in createGatewayCollection — `packages/gateway-client/src/sync/createGatewayCollection.ts:281-309`
  - _remaining:_ onError non-auth path and error-driven reconnect branch still untested
- [x] **P2** snapshotToGatewayRunNode nodeKind/nodeName/nodeStatus branches partially untested — `packages/gateway-client/src/sync/snapshotToGatewayRunNode.ts:49-87` — added 3 branch-coverage tests: the full nodeKind switch (Approval/Signal/WaitForEvent/Human/HumanTask/Loop/ForEach/Task/Agent/unknown→compute), the nodeName fallback chain (task.label→props.label→props.name→task.nodeId→node.name), and the toRunStatus mapping (all five tones + unknown→queued). 91 gateway-client tests green.
  - _remaining:_ nodeKind signal/human/loop/ForEach/WaitForEvent branches, running/failed/cancelled statuses, and props-based nodeName fallback still unasserted
- [ ] **P2** streamExtension and extensionRpc lack reconnect/error-frame and abort coverage — `packages/gateway-client/src/SmithersGatewayClient.ts:562-602`
  - _remaining:_ streamExtension lacks reconnect-after-drop, mid-stream error-frame surfacing, and AbortSignal/abort coverage (SmithersGatewayClient.ts:562-602)
- [ ] **P2** useSyncMutation success-path branches (invalidate, onSuccess, reset, mutateSafe, success status) untested — `packages/gateway-react/src/sync/useSyncMutation.ts:85-122; packages/gateway-react/tests/sync/sync.test.ts:246-287`
  - _remaining:_ useSyncMutation success-path branches (invalidate, onSuccess, reset) still untested directly
- [ ] **P2** Connection observer offline/connecting transitions and reconnectingSince never asserted — `packages/gateway-react/src/sync/createGatewayCollections.ts:78-101; packages/gateway-react/tests/sync/sync.test.ts:576-628`
  - _remaining:_ markConnecting/markOffline transitions and reconnectingSince field never asserted
- [ ] **P2** invalidate() re-pull of pollable list collections via the pulser is untested — `packages/gateway-react/src/sync/createGatewayCollections.ts:109-147,387-391; packages/gateway-react/tests/sync/sync.test.ts`
  - _remaining:_ invalidate() re-pull of pollable list collections via the pulser is still entirely untested
- [ ] **P2** isAuthError 401/403 status and code-based branches untested — `packages/gateway-react/src/sync/createGatewayCollections.ts:53-62`
  - _remaining:_ isAuthError status===401/403 and code-based branches untested; only message-regex hit indirectly
- [ ] **P2** useGatewayExtensionAction error path and double-call generation fence untested — `packages/gateway-react/src/useGatewayExtensionAction.ts:33-39; packages/gateway-react/tests/extension-hooks.test.ts:129-158`
  - _remaining:_ Error path (catch at :33-39) and double-call generation fence untested
- [ ] **P2** useGatewayRunEvents afterSeq filter and error state untested — `packages/gateway-react/src/useGatewayRunEvents.ts:45,58-59; packages/gateway-react/tests/sync/sync.test.ts:455-503`
  - _remaining:_ useGatewayRunEvents afterSeq filter (src:45) and error state (live.isError, src:58) never asserted
- [ ] **P2** createGatewayReactRoot success path (mount + dual-provider wiring) untested — `packages/gateway-react/src/createGatewayReactRoot.ts:12-34; packages/gateway-react/tests/gateway-react.test.ts:78-101`
  - _remaining:_ createGatewayReactRoot success path (real mount + dual-provider wiring) still untested
- [ ] **P2** useSyncClient missing-provider throw and SyncContext default are untested — `packages/gateway-react/src/sync/useSyncClient.ts:10-16; packages/gateway-react/src/sync/SyncContext.ts`
  - _remaining:_ useSyncClient missing-provider throw and SyncContext default untested directly
- [ ] **P2** Metric increments are never asserted; duration is not recorded on error — `packages/openapi/src/tool-factory/_helpers.js:143-159`
  - _remaining:_ Metric increments never asserted; error-path duration recording untested
- [ ] **P2** No real-backend e2e: e2e.test.js mocks globalThis.fetch — `packages/openapi/tests/e2e.test.js:4-22, packages/openapi/tests/execution.test.js, packages/openapi/tests/execution-escaping.test.js`
  - _remaining:_ No real-backend e2e against an actual HTTP server; e2e.test.js still mocks fetch
- [ ] **P2** Connection-limit (503) WS upgrade rejection path is untested — `packages/server/src/gateway.js:2302-2323`
  - _remaining:_ Connection-limit (503) WS upgrade rejection path still untested
- [ ] **P2** Built-in operator UI (1.4k-line stringified browser app) has zero behavioral coverage — `packages/server/src/gatewayUi/defaultOperatorUi.js:3-1430`
  - _remaining:_ defaultOperatorUi.js (1.4k-line browser app) still has zero behavioral/DOM coverage
- [ ] **P2** mapEvent's ~30-case SmithersEvent→wire mapping has minimal direct coverage — `packages/server/src/gateway.js:3558-3793`
  - _remaining:_ gateway.js:3577 mapEvent has no direct unit test enumerating its ~30 SmithersEvent→wire cases
- [ ] **P2** createSmithersPostgres and findFreePgPort have no test coverage inside packages/smithers — `packages/smithers/src/create.js:481-580`
  - _remaining:_ create.js:481-580 createSmithersPostgres and findFreePgPort remain untested within packages/smithers
- [ ] **P2** bin/smithers.js local-CLI delegation logic is untested in this package — `packages/smithers/src/bin/smithers.js:1-160`
  - _remaining:_ packages/smithers/src/bin/smithers.js local-CLI delegation logic still untested in this package
- [ ] **P2** Several create.js branches uncovered: anchor-based default dbPath, journalMode option, input ALTER catch — `packages/smithers/src/create.js:372-374, 392, 427-436`
  - _remaining:_ journalMode option override and anchor-based default dbPath resolution branches still untested
- [x] **P2** findSmithersAnchorDir fsRoot guard and HOME-unset branch only covered indirectly — `packages/smithers/src/findSmithersAnchorDir.js:18-31` — added a real-filesystem test (no mocks; temp HOME + dirs, restored in afterEach): walk-up to the nearest `.smithers/` anchor below HOME, the non-directory `.smithers` guard, the at/above-HOME exclusion (incl. sibling-outside-HOME), and the HOME-unset path that walks to the fsRoot guard. 28 smithers tests + root typecheck + lint green.
  - _remaining:_ Within packages/smithers, no direct test for the fsRoot guard or HOME-unset branch
- [ ] **P2** Public mdxPlugin (and createExternalSmithers) lack package-level coverage / in-repo consumers — `packages/smithers/src/mdx-plugin.js:1-6, packages/smithers/src/external/index.js`
  - _remaining:_ Public mdxPlugin (mdx-plugin.js) still has no package-level test
- [ ] **P1** Declarative TanStack-DB sync hooks have no real-browser e2e; no shipped UI exercises them — `packages/gateway-react/src/sync/useSyncQuery.ts, useSyncMutation.ts, useSyncSubscription.ts, useGatewayQuery.ts, useGatewayMutation.ts, useGatewayRunStream.ts, useGatewayRunTree.ts, useGatewayConnectionStatus.ts`
  - _remaining:_ Declarative TanStack-DB sync hooks still have no real-browser e2e and no shipped UI exercises the raw hooks
- [ ] **P2** Default operator console has no behavioral/browser test — only string-grep assertions — `packages/server/tests/gateway-ui.test.jsx:94-180`
  - _remaining:_ Default operator console still validated only by string-matching the served bundle; no behavioral/browser test
- [ ] **P2** 13 canonical init workflows ship with no custom UI (violates the 'every built-in workflow has a UI' bar) — `apps/cli/src/workflow-pack.js:1651 (UI_WORKFLOWS) vs the 30 workflows emitted by renderTemplateFiles`
  - _remaining:_ UI buildout substantial (17 UIs + all-UI e2e) but the bar is not fully met (23 templates vs 17 UIs) and is unguarded
- [ ] **P2** kanban UI ships and is mounted but is not functionally covered by the all-UI e2e — `apps/cli/tests/workflow-ui-descriptors.json; apps/cli/tests/workflow-ui-all.e2e.test.js`
  - _remaining:_ kanban UI ships and is mounted but is still not functionally covered by the all-UI e2e
- [ ] **P2** No test guards UI_WORKFLOWS / gateway-mounts / ui-files / e2e-descriptors against drift — `apps/cli/src/workflow-pack.js:1651 (UI_WORKFLOWS); apps/cli/tests/init.e2e.test.js`
  - _remaining:_ No test guards UI_WORKFLOWS / gateway-mounts / ui-files / e2e-descriptors against drift relative to each other
