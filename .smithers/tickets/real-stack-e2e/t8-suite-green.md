# t8-suite-green — Full real suite + repo gates green in one shot

Stabilization ticket — make the whole thing green in ONE command from a cold start:

- `pnpm -C apps/smithers typecheck` green.
- `pnpm -C apps/smithers test:unit` green (including any assumption tests you added).
- `pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts` green — all e2e-real specs in one run, sharing one stack boot, no inter-spec interference (workers: 1 already; specs assert on their own runIds).
- Fix flakes by fixing root causes (readiness probes, generous-but-bounded timeouts), never by retry-spam or weakened assertions.
- Write apps/smithers/docs/e2e-real.md describing: required secrets in .env.e2e.local (chat upstream: CEREBRAS_API_KEY or GEMINI_API_KEY), plue-up.sh usage, the port map, the 7342-vs-7331 gateway rule, and how to run the suite. Link it from the apps/smithers README.
- Ensure every piece of this work is committed (atomic, emoji conventional commits). Do not push — the workflow pushes after this gate.

Success criteria: the verify command exits 0, run twice in a row (idempotency). git status shows no uncommitted files from this work.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers typecheck && pnpm -C apps/smithers test:unit && pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts
```
