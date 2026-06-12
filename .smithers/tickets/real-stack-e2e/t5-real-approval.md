# t5-real-approval — Human approval round-trip through the real gateway UI

1. `.smithers/workflows/e2e-approval-probe.tsx`: an <Approval> node (request title/summary) followed by a static Task that only mounts after approval (see the Approval docs pattern). Same mount caveat as t4: a stale gateway on 7342 must be restarted to pick the file up.
2. `apps/smithers/tests/e2e-real/approval.spec.ts`: launch e2e-approval-probe on the real gateway through the UI, assert the run pauses waiting-approval and the approval request surfaces in the UI, approve it FROM THE UI, then assert the run resumes and reaches finished with the gated task's output present.

Success criteria: the whole round-trip is driven through the real gateway RPC path (no direct DB pokes, no CLI approve in the spec), and the verify command exits 0.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/approval.spec.ts
```
