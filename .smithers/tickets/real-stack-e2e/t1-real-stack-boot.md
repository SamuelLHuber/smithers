# t1-real-stack-boot — Real stack boots: plue compose + cwd gateway + real playwright config

Build the no-mock stack skeleton. Deliverables:

1. `scripts/e2e-real/plue-up.sh`:
   - default action (no arg): `docker compose up -d postgres migrate seed repo-host api` in $PLUE_DIR (default ../plue), wait for http://127.0.0.1:4000/api/health (up to 180s — migrations dominate cold boot), then `exec sleep infinity` so a playwright webServer can own the process. Plue keeps running when playwright kills the sleeper; reuseExistingServer makes the next run skip the boot.
   - `down` / `status` args for humans: act and exit (down = compose down in $PLUE_DIR).
   - Distinct non-zero exit code per failed leg. Idempotent: compose up on a running stack is a no-op.
2. `apps/smithers/playwright.real.config.ts`:
   - testDir tests/e2e-real, workers: 1 (shared gateway DB + shared plue state), webServer entries:
     (a) plue: command `bash ../../scripts/e2e-real/plue-up.sh`, url http://127.0.0.1:4000/api/health, reuseExistingServer: true, timeout 240s.
     (b) gateway in the cwd: command `bun ../../.smithers/gateway.ts`, env { PORT: "7342", HOST: "127.0.0.1" }, url http://127.0.0.1:7342/health, reuseExistingServer: true. (gateway.ts chdir's itself to the repo root, so the command cwd does not matter.) Inject the values read from apps/smithers/.env.e2e.local (plain fs read in the config, tolerate absence) into this leg's env so agent credentials reach the claude CLI processes the gateway spawns.
     (c) vite on 127.0.0.1:5375 with SMITHERS_AUTH_PROXY_TARGET + SMITHERS_PLATFORM_PROXY_TARGET = http://127.0.0.1:4000 and SMITHERS_GATEWAY_PROXY_TARGET = http://127.0.0.1:7342. No fixture processes anywhere in this config.
   - Seed onboarding-completed localStorage for the app origin like the fixture config does (that is app state, not a mock).
3. `apps/smithers/tests/e2e-real/stack.spec.ts`:
   - request GET /health on the app origin -> JSON {ok:true} (proves vite -> cwd gateway proxy);
   - request GET /workflows on the app origin -> JSON listing at least one workflow (proves the gateway mounted the local pack);
   - request GET /api/user anonymously -> 401 with a JSON body (proves vite -> REAL plue api, not the SPA fallback);
   - page loads / and the app shell renders.

Success criteria:
- The verify command exits 0 from a cold start (plue down, no gateway on 7342).
- Running it again with everything already up is also green and faster (reuse).
- No file under tests/e2e-real or the real config imports from tests/fixtures.
Study apps/smithers/vite.config.ts for the exact proxy env var names, scripts/dev-with-plue.sh for the plue boot/health contract and the gateway reuse/refuse-to-clobber rules, and apps/smithers/playwright.config.ts ONLY for the storageState pattern.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/stack.spec.ts
```
