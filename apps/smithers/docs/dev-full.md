# dev:full — one-command dev backend bridge

`pnpm -C apps/smithers dev:full` boots every backend the web app needs and
starts vite with all four same-origin proxies wired. The script underneath is
`scripts/dev-with-plue.sh`, the same file documented historically as
"dev with Plue" — `dev:full` is its npm entrypoint.

If you just want a chat tab you can use `pnpm dev`. That path leaves the four
proxy env vars unset, so `/api/auth/*`, `/api/user`, `/v1/rpc`, and `/health`
all fall through to the SPA and return `index.html`. Token sign-in then throws
on `response.json()` and silently flips signed-out. `dev:full` is the green
path.

## What it boots

| Leg | Backend | Same-origin paths | Dev proxy env var |
|---|---|---|---|
| Auth | Plue api on `:4000` | `/api/auth/*`, `/api/user` | `SMITHERS_AUTH_PROXY_TARGET` |
| Platform | Plue api on `:4000` | `/api/repos`, `/api/orgs`, `/api/user/<sub>`, `/api/workspaces`, `/api/issues`, `/api/landings`, `/api/notifications`, `/api/search`, `/api/integrations`, `/api/oauth2`, `/resolve` | `SMITHERS_PLATFORM_PROXY_TARGET` |
| Gateway | Smithers gateway on `127.0.0.1:7331` | `/v1/rpc` (ws), `/health`, `/workflows` | `SMITHERS_GATEWAY_PROXY_TARGET` |
| Chat | Cloudflare Worker (via `alchemy dev` / `wrangler dev`) | `/api/chat`, `/metrics` | `SMITHERS_CHAT_PROXY_TARGET` |

The proxy plumbing lives in `apps/smithers/vite.config.ts`. `dev:full` only
exports the targets — it does not touch the vite config.

## Boot sequence

1. **Plue.** `docker compose up -d postgres migrate seed repo-host api` from
   `$PLUE_DIR` (default `/Users/williamcory/plue`). Docker compose is itself
   idempotent, so a second run just observes the existing services. The script
   polls `GET $PLUE_API_BASE_URL/api/health` until it returns `200` and fails
   with a distinct exit code on timeout.
2. **Gateway.** Probes `GET http://127.0.0.1:7331/health` first. If it already
   answers with `{ ok: true }`, the script reuses it and prints
   `gateway already up, reusing`. If the port is bound but `/health` is bad,
   it exits non-zero rather than killing whatever else is on the port. If
   nothing is listening, it spawns `bun .smithers/gateway.ts` with
   `PORT=7331 HOST=127.0.0.1`, logs to `/tmp/smithers-dev-full-gateway.log`,
   and polls `/health` until ready. The cleanup trap only kills the PID this
   script itself spawned.
3. **Vite.** Starts `pnpm vite --host $SMITHERS_DEV_HOST --port $SMITHERS_DEV_PORT --strictPort`
   with the four proxy env vars exported.
4. **End-to-end probes.** Polls `http://127.0.0.1:$SMITHERS_DEV_PORT/api/health`
   (proves vite → proxy → Plue) and `http://127.0.0.1:$SMITHERS_DEV_PORT/health`
   (proves vite → proxy → gateway). Either failure exits non-zero with a
   distinct code so a CI runner or a wrapper script can diagnose the broken
   leg.

## Health probe path

Plue exposes `/api/health`, `/api/healthz` is **not** an alias. Earlier versions
of this script probed `/api/healthz`; it has been returning `404` against the
live Plue api for the lifetime of this script and is the reason `dev:full`
exists. The probe path is pinned to `/api/health` in one place at the top of
the script and asserted in
`apps/smithers/tests/assumptions/dev-backend-bridge.assumptions.test.ts` so a
regression turns the assumption suite red instead of hanging the orchestrator.

## Chat-leg behavior

`/api/chat` in production is owned by the Cloudflare Worker
(`apps/smithers/src/worker.ts`). The Worker composes a TanStack AI `chat()`
server-side with `CEREBRAS_API_KEY`. It is not a thin reverse proxy.

`dev:full` therefore treats the chat leg as a best-effort gate, not a mock:

- If `SMITHERS_CHAT_PROXY_TARGET` is exported (e.g. you started
  `pnpm cf:dev` in another terminal and want vite to point at it), `dev:full`
  passes it through and `/api/chat` works.
- If `CEREBRAS_API_KEY` is set but `SMITHERS_CHAT_PROXY_TARGET` is not, the
  script asks for a Worker URL on stdin when the shell is interactive. Under
  CI / tee / nohup it warns and continues with the chat leg disabled.
- If neither is set, the script warns that `/api/chat` will 404 in dev and
  continues. Token sign-in, the run inspector, and the platform surfaces all
  work without chat; only the chat tab is degraded.

Mocking the Cerebras API is explicitly off-limits — the `no mocks` rule in
CLAUDE.md applies here. The fix for "I want chat in dev" is to run the Worker
yourself (`pnpm cf:dev` and export the URL), not to fabricate a response.

## Idempotency

Safe to run a second time while the first is still up:

- Docker compose just re-observes the running services.
- The gateway pre-probe finds `/health` ok and reuses the existing process.
- Vite uses `--strictPort`, so the second invocation fails fast on the port
  collision instead of double-binding.

The cleanup trap only kills the gateway PID `dev:full` itself spawned, so
re-running on top of a long-lived gateway does not surprise other workspaces.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `PLUE_DIR` | `/Users/williamcory/plue` | Plue checkout containing `docker-compose.yml` |
| `PLUE_API_BASE_URL` | `http://127.0.0.1:4000` | Plue api origin used for both auth and platform legs |
| `SMITHERS_DEV_HOST` | `127.0.0.1` | Vite bind host |
| `SMITHERS_DEV_PORT` | `5175` | Vite bind port |
| `SMITHERS_GATEWAY_HOST` | `127.0.0.1` | Gateway bind host |
| `SMITHERS_GATEWAY_PORT` | `7331` | Gateway bind port |
| `SMITHERS_CHAT_PROXY_TARGET` | _unset_ | Worker URL for `/api/chat`. Optional. |
| `CEREBRAS_API_KEY` | _unset_ | Cerebras key for the Worker. Read by the Worker, not by vite. |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Vite exited cleanly. |
| `2` | `PLUE_DIR` missing or `docker-compose.yml` not found. |
| `3` | Plue `/api/health` did not become ready within 60s. |
| `4` | Vite died before any proxy probe went green. |
| `5` | Vite → Plue end-to-end probe (`/api/health`) failed. |
| `6` | Gateway `/health` did not become ready within 60s. |
| `7` | Gateway port is bound but `/health` is bad — refuse to kill a foreign listener. |
| `8` | Vite → gateway end-to-end probe (`/health`) failed. |

## Related

- `apps/smithers/tests/assumptions/dev-backend-bridge.assumptions.test.ts` —
  proves `/api/health`, `/api/user → 401`, gateway `/health`, and the
  seeded-bearer path.
- `apps/smithers/vite.config.ts` — the proxy table this script feeds.
- `apps/smithers/tests/fixtures/fakePlueHost.ts` —
  the in-repo fake Plue host for Docker-less dev (`bun tests/fixtures/fakePlueHost.ts`).
