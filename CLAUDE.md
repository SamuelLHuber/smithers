# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## Apps in this repo (read first)

- **`apps/smithers` is the only app.** One codebase, two shipping targets:
  the **web app** (chat-first Vite + React PWA, deployed to Cloudflare as a
  Worker via Alchemy) and an **Electrobun native app** (a desktop packaging of
  the same build). It is already Electrobun-aware (`src/app/history.ts` switches
  to hash history under a desktop webview), but the native packaging is not built
  yet. All product work goes here. "The app" / "our app" / "web app and native
  app" all mean `apps/smithers`.
- **`~/gui` (Swift/AppKit) and `apps/smithers-studio-2` (Electrobun/React) are
  retired POCs.** Both were built to inform how `apps/smithers` is built, then
  set aside. Neither is in the stack. Do not put product work in them, do not
  cite their tech or patterns as current, and ignore them unless explicitly
  asked.

## Branching & commits

- **Always work directly on `main`.** Do not create feature branches unless the
  user *explicitly* asks you to. Commit and push to `main`.
- **Atomic commits.** One logical change per commit — a feature and its test can
  go together, but unrelated changes get separate commits. Never bundle
  unrelated work into one commit.
- **Emoji + Conventional Commits.** Every commit message starts with an emoji,
  then a conventional-commit subject. Examples:
  - `✨ feat(cli): add \`smithers ui\` command`
  - `🐛 fix(studio): live-run events for detached runs`
  - `✅ test(server): gateway shared-DB run attribution`
  - `♻️ refactor(runs): batch live-event frame application`
  - `🔒 fix(gateway): reject cross-origin PTY upgrades`
  - `📝 docs: …`  ·  `🔧 chore: …`  ·  `🙈 chore: gitignore …`
- End commit messages with the `Co-Authored-By` trailer when authored by an agent.
- Push to `origin` (`github.com/smithersai/smithers`) `main` unless told otherwise.

## Verify before you push

`main` is shared. Before committing/pushing, keep the gate green:
- `pnpm typecheck` (per package / app)
- relevant `bun test` suites (packages and `apps/smithers` use `bun test`; app unit = `pnpm -C apps/smithers test:unit`)
- `pnpm -C apps/smithers exec playwright test` for `apps/smithers` e2e (real-backend, no mocks)

## No mocks

Product code and e2e tests must use real backends/data — no `mockGateway`, no
`page.route`/`routeWebSocket` data fabrication, no hardcoded/fallback stand-ins.
Fixtures may be real servers seeded with deterministic data; deliberate
failure-injection against a real fault path is acceptable. In `apps/smithers`
the dev server proxies same-origin `/api/*` to real backends: point it at a real
or local Plue (`apps/smithers/scripts/dev-with-plue.sh`, `PLUE_DIR=...`), or at
the in-repo fake Plue host fixture (`tests/fixtures/fakePlueHost.ts`) for token
sign-in. The Playwright e2e suite boots the full real stack via its `webServer`.
