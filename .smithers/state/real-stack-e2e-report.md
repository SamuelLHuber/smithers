# Real-Stack E2E Evidence Report

Generated: 2026-06-13

## What Shipped

### Playwright configs

| File | Purpose |
| --- | --- |
| `apps/smithers/playwright.real.config.ts` | Main real-stack suite (testDir `tests/e2e-real`, workers: 1, four webServer legs) |
| `apps/smithers/playwright.capture.config.ts` | Extends real config with video-on at 1280×720, writes `capture-results/` |
| `apps/smithers/playwright.slideshow.config.ts` | Slideshow spec only, no webServer (file:// origin) |

### Spec files (`apps/smithers/tests/e2e-real/`)

19 spec files, 30 tests total (from `--list`):

| Spec | Tests |
| --- | --- |
| `stack.spec.ts` | 1 — real stack exposes app, gateway, and Plue through Vite `@nogif` |
| `signin.spec.ts` | 1 — signs in with the real seeded Plue token |
| `chat.spec.ts` | 1 — streams a real assistant reply through the real Worker |
| `gatewayRun.spec.ts` | 1 — launches a real Claude agent workflow on the cwd gateway |
| `approval.spec.ts` | 1 — approves a real gateway approval request from the UI |
| `onboarding.spec.ts` | 1 — walks the first-run overlay to completion |
| `surfaces.spec.ts` | 8 — /runs /approvals /agents /memory /prompts /scores /crons /workflow |
| `palette.spec.ts` | 1 — opens from /palette, filters, keyboard navigation |
| `theme.spec.ts` | 1 — flips light/dark and persists across reload |
| `dock.spec.ts` | 1 — opens an app from the dock, persists across reload |
| `featureCards.spec.ts` | 3 — /run card + approval, /diff card, /logs card |
| `inspector.spec.ts` | 1 — deep links render inspector, logs, timeline, and diff |
| `reviewSurfaces.spec.ts` | 3 — /issues /tickets /landings board surfaces |
| `notifications.spec.ts` | 1 — approval gate raises a toast that can be dismissed |
| `runsCanvas.spec.ts` | 1 — toolbar, stream mode, empty search state |
| `launchRun.spec.ts` | 1 — plain-language and slash-command run launch |
| `nav.spec.ts` | 1 — plain-language, slash commands, command menu |
| `gatewayWorkflowUi.spec.ts` | 1 — embeds real workflow UI, toggles to run inspector `@gif` |
| `workflowEditor.spec.ts` | 1 — opens ralph workflow editor canvas and runs doctor `@gif` |

Slideshow spec: `apps/smithers/tests/slideshow/slideshow.spec.ts` (1 test, file:// origin, config `playwright.slideshow.config.ts`).

### Scripts (`scripts/e2e-real/`)

| Script | Purpose |
| --- | --- |
| `plue-up.sh` | Boot/wait/idempotent plue compose; accepts `down` / `status` args |
| `gateway-up.sh` | Boot the cwd gateway on 7342 |
| `vite-up.sh` | Boot Vite on 5375 with real proxy targets |
| `worker.ts` | Boot the real Smithers Worker on 5376 (Cerebras or Gemini upstream) |
| `probe-agent-cred.sh` | Assumption probe: `claude -p "Say OK"` must exit 0 before gatewayRun |
| `capture-gifs.ts` | Run the capture config, convert webm→gif via ffmpeg palettegen |
| `build-slideshow.ts` | Read manifest.json, write self-contained `artifacts/feature-gifs/index.html` |

### Gateway workflow fixtures (`.smithers/workflows/`)

| File | Role |
| --- | --- |
| `e2e-probe.tsx` | Minimal one-task ClaudeCodeAgent workflow (t4 / gatewayRun) |
| `e2e-approval-probe.tsx` | Approval node + gated task (t5 / approval round-trip) |

### Docs

`apps/smithers/docs/e2e-real.md` — port map, required secrets, plue-up usage, suite commands.

---

## Port Map

| Service | Address |
| --- | --- |
| Plue API (docker compose) | `127.0.0.1:4000` |
| Real e2e gateway | `127.0.0.1:7342` |
| Vite / app | `127.0.0.1:5375` |
| Real Worker (chat LLM) | `127.0.0.1:5376` |

Dev gateway (do not stop): `127.0.0.1:7331`.

---

## Required Secrets

Create `apps/smithers/.env.e2e.local` (never commit):

```
# One of these is required for chat.spec.ts:
CEREBRAS_API_KEY=...
# or
GEMINI_API_KEY=...

# Required for gatewayRun.spec.ts (real Claude agent):
# Either supply ANTHROPIC_API_KEY here, or ensure the local `claude` CLI has
# subscription auth (claude /login). The probe script unsets the shell-exported
# key unless this file supplies one with credits.
ANTHROPIC_API_KEY=...
```

---

## How to Boot the Stack and Run the Suite

### Prerequisites

- Docker (for plue compose)
- Plue checkout at `../plue` from the repo root (or set `PLUE_DIR`)
- ffmpeg on PATH (for gif capture only)
- `claude` CLI signed in or `ANTHROPIC_API_KEY` in `.env.e2e.local`

### Full gate

```bash
pnpm -C apps/smithers typecheck
pnpm -C apps/smithers test:unit
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts
```

Individual legs (Playwright boots all webServers automatically via `webServer`):

```bash
# Plue only:
bash scripts/e2e-real/plue-up.sh

# Agent cred probe (before gatewayRun):
bash scripts/e2e-real/probe-agent-cred.sh

# Single spec:
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/signin.spec.ts
```

### Gif capture (warm stack)

```bash
bun scripts/e2e-real/capture-gifs.ts
```

### Slideshow rebuild

```bash
bun scripts/e2e-real/capture-gifs.ts && bun scripts/e2e-real/build-slideshow.ts
```

---

## Ticket-by-Ticket History (ralph quality loop iterations)

### Base tickets (t1–t6) — initial 6-ticket arc

| Ticket | What it added | Key commits |
| --- | --- | --- |
| t1 `real-stack-boot` | plue-up.sh, playwright.real.config.ts, stack.spec.ts (health + 401 + app shell) | `cc1d7d905b`, `bdd1bf7f8c`, `444aca338e` |
| t2 `real-signin` | signin.spec.ts — seeded alice token, reload persistence, plue assumption test | `f301329f7b` |
| t3 `real-chat-llm` | scripts/e2e-real/worker.ts, chat.spec.ts, Cerebras/Gemini upstream selection | `f005404730` |
| t4 `real-gateway-run` | e2e-probe.tsx workflow, probe-agent-cred.sh, gatewayRun.spec.ts (real Claude call) | `7839adbd7d`, `aba95271b0` |
| t5 `real-approval` | e2e-approval-probe.tsx, approval.spec.ts (UI approval round-trip) | `12ef2dbf71` |
| t6 `real-suite-green` | Full suite stabilization, e2e-real.md docs | `2f4b642e14` |

### Ralph-loop expansion (t6-shell, t7-cards, t8-suite-green)

These three tickets were added by the ralph quality loop after the base arc was green:

| Ticket | What it added | Key commits |
| --- | --- | --- |
| t6-shell-coverage | onboarding, surfaces (8 slash commands), palette, theme, dock specs | `034cd90020` |
| t7-cards-coverage | featureCards (3 tests), inspector, reviewSurfaces (3 boards), notifications; fix logs slash surface | `59717a420a`, `4315118e80` |
| t8-suite-green | runsCanvas, launchRun, nav, workflowEditor, gatewayWorkflowUi specs; 9 stabilization commits fixing: onboarding reload reauth, dock reload reauth, gateway workflow UI flakes, backpressure coverage, selector coverage | `3d1583bc5f`, `eb635fbf01`, `f9c165099e`, `c2c3e3613c`, `7117606fb7`, `383474cb82`, `342e220f34`, `2adde8ae75`, `e1bc0e1951`, `0312d86f32` |

### Gif capture + slideshow (t9, t10)

| Ticket | What it added | Key commits |
| --- | --- | --- |
| t9 `gif-capture` | playwright.capture.config.ts, capture-gifs.ts (ffmpeg palettegen), manifest.json with 29 gifs | `db2b49c08a` |
| t10 `slideshow` | build-slideshow.ts, playwright.slideshow.config.ts, slideshow.spec.ts, artifacts/feature-gifs/index.html | `135eb2d275`, `f0f21b4ee8` |

---

## Spec Enumeration (from `--list`)

```
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts --list
```

Output (30 tests, 19 files, chromium):

```
[chromium] › approval.spec.ts › approves a real gateway approval request from the UI and resumes the run
[chromium] › chat.spec.ts › streams a real assistant reply through the real Worker
[chromium] › dock.spec.ts › real app dock › opens an app from the dock and persists dock state across reload
[chromium] › featureCards.spec.ts › real-stack chat feature cards › /run posts a progressing run card, then approval can be approved from the card
[chromium] › featureCards.spec.ts › real-stack chat feature cards › /diff posts a diff card for the launched run
[chromium] › featureCards.spec.ts › real-stack chat feature cards › /logs posts a logs card and opens the logs surface from the card
[chromium] › gatewayRun.spec.ts › launches a real Claude agent workflow on the cwd gateway and shows its output
[chromium] › gatewayWorkflowUi.spec.ts › embeds the real workflow UI and toggles to the run inspector @gif
[chromium] › inspector.spec.ts › real-stack run inspector surfaces › deep links render inspector, logs, timeline, and diff for the launched run
[chromium] › launchRun.spec.ts › real launch run flow › launches runs from plain language and the feature slash entrypoint
[chromium] › nav.spec.ts › real composer navigation @gif › routes plain-language, slash commands, and command menu selections
[chromium] › notifications.spec.ts › real-stack approval notifications › a run reaching its approval gate raises a toast that can be dismissed
[chromium] › onboarding.spec.ts › real first-run onboarding › walks the first-run overlay to completion and keeps it dismissed
[chromium] › palette.spec.ts › real quick-open palette › opens from /palette, filters, and executes keyboard navigation
[chromium] › reviewSurfaces.spec.ts › real-stack review board surfaces › /issues opens its board surface
[chromium] › reviewSurfaces.spec.ts › real-stack review board surfaces › /tickets opens its board surface
[chromium] › reviewSurfaces.spec.ts › real-stack review board surfaces › /landings opens its board surface
[chromium] › runsCanvas.spec.ts › real runs canvas › renders toolbar, toggles stream mode, and shows empty search state
[chromium] › signin.spec.ts › signs in with the real seeded Plue token
[chromium] › stack.spec.ts › real stack exposes app, gateway, and Plue through Vite @nogif
[chromium] › surfaces.spec.ts › real canvas surfaces › /runs opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /approvals opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /agents opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /memory rust opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /prompts opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /scores opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /crons opens its canvas surface
[chromium] › surfaces.spec.ts › real canvas surfaces › /workflow opens its canvas surface
[chromium] › theme.spec.ts › real theme toggle › flips light/dark and persists across reload
[chromium] › workflowEditor.spec.ts › opens the real ralph workflow editor canvas and runs doctor @gif
Total: 30 tests in 19 files
```

---

## Gif Evidence (29 gifs, artifacts/feature-gifs/manifest.json)

`stack.spec.ts` is tagged `@nogif` (request-only, no visible UI). All other 18 spec files produced gifs; parameterized specs (surfaces, featureCards, reviewSurfaces) produced one gif per test case, for 29 total.

| Slug | Spec | Size |
| --- | --- | --- |
| approval-spec-approves-a-real-gateway-approval-request-from-the-ui-and-resumes-the-run | approval.spec.ts | 2.0 MB |
| chat-spec-streams-a-real-assistant-reply-through-the-real-worker | chat.spec.ts | 640 KB |
| dock-spec-opens-an-app-from-the-dock-and-persists-dock-state-across-reload | dock.spec.ts | 382 KB |
| featurecards-spec-diff-posts-a-diff-card-for-the-launched-run | featureCards.spec.ts | 243 KB |
| featurecards-spec-logs-posts-a-logs-card-and-opens-the-logs-surface-from-the-card | featureCards.spec.ts | 964 KB |
| featurecards-spec-run-posts-a-progressing-run-card-then-approval-can-be-approved-from-the-card | featureCards.spec.ts | 1.2 MB |
| gatewayrun-spec-launches-a-real-claude-agent-workflow-on-the-cwd-gateway-and-shows-its-output | gatewayRun.spec.ts | 2.4 MB |
| gatewayworkflowui-spec-embeds-the-real-workflow-ui-and-toggles-to-the-run-inspector-gif | gatewayWorkflowUi.spec.ts | 1.4 MB |
| inspector-spec-deep-links-render-inspector-logs-timeline-and-diff-for-the-launched-run | inspector.spec.ts | 1.7 MB |
| launchrun-spec-launches-runs-from-plain-language-and-the-feature-slash-entrypoint | launchRun.spec.ts | 168 KB |
| nav-spec-routes-plain-language-slash-commands-and-command-menu-selections | nav.spec.ts | 855 KB |
| notifications-spec-a-run-reaching-its-approval-gate-raises-a-toast-that-can-be-dismissed | notifications.spec.ts | 1.1 MB |
| onboarding-spec-walks-the-first-run-overlay-to-completion-and-keeps-it-dismissed | onboarding.spec.ts | 635 KB |
| palette-spec-opens-from-palette-filters-and-executes-keyboard-navigation | palette.spec.ts | 1.3 MB |
| reviewsurfaces-spec-issues-opens-its-board-surface | reviewSurfaces.spec.ts | 813 KB |
| reviewsurfaces-spec-landings-opens-its-board-surface | reviewSurfaces.spec.ts | 875 KB |
| reviewsurfaces-spec-tickets-opens-its-board-surface | reviewSurfaces.spec.ts | 914 KB |
| runscanvas-spec-renders-toolbar-toggles-stream-mode-and-shows-empty-search-state | runsCanvas.spec.ts | 958 KB |
| signin-spec-signs-in-with-the-real-seeded-plue-token | signin.spec.ts | 512 KB |
| surfaces-spec-agents-opens-its-canvas-surface | surfaces.spec.ts | 692 KB |
| surfaces-spec-approvals-opens-its-canvas-surface | surfaces.spec.ts | 361 KB |
| surfaces-spec-crons-opens-its-canvas-surface | surfaces.spec.ts | 646 KB |
| surfaces-spec-memory-rust-opens-its-canvas-surface | surfaces.spec.ts | 959 KB |
| surfaces-spec-prompts-opens-its-canvas-surface | surfaces.spec.ts | 314 KB |
| surfaces-spec-runs-opens-its-canvas-surface | surfaces.spec.ts | 763 KB |
| surfaces-spec-scores-opens-its-canvas-surface | surfaces.spec.ts | 677 KB |
| surfaces-spec-workflow-opens-its-canvas-surface | surfaces.spec.ts | 803 KB |
| theme-spec-flips-light-dark-and-persists-across-reload | theme.spec.ts | 155 KB |
| workfloweditor-spec-opens-the-real-ralph-workflow-editor-canvas-and-runs-doctor-gif | workflowEditor.spec.ts | 1.1 MB |

---

## Slideshow

**Location:** `artifacts/feature-gifs/index.html` (generated, not committed — open directly in a browser with no server)

**Regeneration:**

```bash
bun scripts/e2e-real/capture-gifs.ts && bun scripts/e2e-real/build-slideshow.ts
```

The slideshow is self-contained (inline CSS+JS, gifs referenced by relative path). It has a title slide plus one slide per manifest entry (30 slides total), with ←/→ keyboard navigation, prev/next buttons, dot indicators, and an n/total counter.

---

## Remaining Risks and Flakes

- **CEREBRAS_API_KEY is the human gate.** The chat and (indirectly) the gif-capture run require a live chat upstream in `.env.e2e.local`. The suite refuses to boot without one.
- **Real Claude calls are slow and rate-limited.** gatewayRun.spec.ts and approval.spec.ts each make a real Claude API call (30–120 s). A rate-limited account or an expired subscription will fail these specs with a timeout.
- **Plue cold boot.** First run after `compose down` takes up to 3 minutes (migrations). The 240 s `webServer.timeout` covers this, but a heavily loaded machine may still time out.
- **7342 stale gateway.** If the e2e gateway on 7342 was started before new workflow fixtures were added, it will not serve them. The spec setup guards against this by probing `/workflows` and restarting if the fixture is absent, but a manually lingering process can confuse `reuseExistingServer`.
- **ffmpeg path.** `capture-gifs.ts` invokes `ffmpeg` from `PATH`. CI machines may need an explicit install step.
- **Slideshow gifs committed check.** `artifacts/` is gitignored. The slideshow cannot be linked as a static URL without a deploy step.

---

## Follow-ups

- Add the suite to CI once `CEREBRAS_API_KEY` or `GEMINI_API_KEY` is available as a CI secret.
- Deploy `artifacts/feature-gifs/` as a static site (Cloudflare Pages or R2) to make the slideshow linkable from PRs.
- Add a `probe-agent-cred.sh` equivalent for the chat upstream so the suite fails fast on a missing key before booting the full stack.
- Consider recording the full e2e run in CI video mode and uploading the manifest+gifs as a build artifact for PR review.
