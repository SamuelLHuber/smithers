# Real E2E Suite

This suite runs against real services only. It starts the Plue compose stack, a local Smithers gateway process, the real Smithers Worker hosted by Bun, and Vite.

## Required Secrets

Create `apps/smithers/.env.e2e.local` with one real chat upstream:

```bash
CEREBRAS_API_KEY=...
```

or:

```bash
GEMINI_API_KEY=...
```

Optional chat overrides are `CEREBRAS_BASE_URL`, `CEREBRAS_MODEL`, and `SMITHERS_E2E_CHAT_MODEL`. If Claude agent helpers are used, provide a working `ANTHROPIC_API_KEY` in this file or make sure the local `claude` CLI has subscription auth. The helper scripts unset the shell-provided `ANTHROPIC_API_KEY` unless this local env file explicitly supplies one.

Do not commit `.env.e2e.local`.

## Plue

The suite expects the Plue checkout at `../plue` from the repo root, or set `PLUE_DIR=/path/to/plue`.

```bash
bash scripts/e2e-real/plue-up.sh
```

`plue-up.sh` is idempotent. It runs `docker compose up -d postgres migrate seed repo-host api` in the Plue checkout and waits for `http://127.0.0.1:4000/api/health`. Use `bash scripts/e2e-real/plue-up.sh down` to stop the Plue stack.

## Port Map

| Service | Default |
| --- | --- |
| Plue API | `127.0.0.1:4000` |
| Real e2e gateway | `127.0.0.1:7342` |
| Real app | `127.0.0.1:5375` |
| Real Worker leg | `127.0.0.1:5376` |

The real e2e gateway is a local process:

```bash
PORT=7342 HOST=127.0.0.1 bun .smithers/gateway.ts
```

Do not use or stop the dev gateway on `7331` for this suite. The e2e gateway shares `.smithers/smithers.db` with any dev gateway, so specs assert on the run IDs they launch.

## Run

From the repo root:

```bash
pnpm -C apps/smithers typecheck
pnpm -C apps/smithers test:unit
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts
```

The full gate is:

```bash
pnpm -C apps/smithers typecheck && pnpm -C apps/smithers test:unit && pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts
```
