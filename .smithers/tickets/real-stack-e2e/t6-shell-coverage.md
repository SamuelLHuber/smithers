# t6-shell-coverage — App-shell feature coverage on the real stack: onboarding, surfaces, palette, theme, dock

Port the core app-shell user flows to the real stack as zero-mock specs. Five new spec files under apps/smithers/tests/e2e-real/. Study the fixture suite's equivalents (apps/smithers/tests/e2e/onboarding.spec.ts, surfaces.spec.ts, paletteCanvas.spec.ts, theme.spec.ts, dock.spec.ts) for flows and selectors, but import NOTHING from tests/fixtures/ — these flows run on the app's own local engine against the real stack and need no fabricated backend.

1. `onboarding.spec.ts` — the first-run onboarding overlay: use a FRESH storage state (`test.use({ storageState: { cookies: [], origins: [] } })` to bypass the config's onboarding-completed seed), walk the onboarding phases to completion, assert the overlay dismisses and stays dismissed across a reload.
2. `surfaces.spec.ts` — the canvas-surface sweep: through the composer, type each slash command (/runs, /approvals, /agents, /memory, /prompts, /scores, /crons, /workflow) and assert the surface it opens renders its heading/canvas. Drive it visibly (fill the textbox, press Enter) — these recordings become feature gifs later.
3. `palette.spec.ts` — quick-open palette: open via /palette (plus the keyboard shortcut if one exists), type a query, navigate to a result, assert the navigation landed.
4. `theme.spec.ts` — theme toggle: flip light↔dark, assert the document theme attribute flips and the choice persists across reload.
5. `dock.spec.ts` — the right-edge app dock: open an app from the dock, assert its surface appears; assert dock state persists across reload.

Success criteria:
- All five specs pass via the verify command against the real stack.
- Specs drive the UI like a user (type, click, keyboard) and assert on visible state — they must be visually meaningful when video-recorded.
- Deterministic: rely on playwright auto-waiting, never on raw sleeps for animation timing.

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/onboarding.spec.ts tests/e2e-real/surfaces.spec.ts tests/e2e-real/palette.spec.ts tests/e2e-real/theme.spec.ts tests/e2e-real/dock.spec.ts
```
