# t7-cards-coverage — Chat cards + inspector + review surfaces + notifications on the real stack

Port the chat-card and inspector flows to the real stack. Four new spec files under apps/smithers/tests/e2e-real/ (same rules as t6: study the tests/e2e/ equivalents — featureCards.spec.ts, runsCanvas.spec.ts, reviewSurfaces.spec.ts, toasts.spec.ts/notifications.spec.ts — zero fixture imports).

1. `featureCards.spec.ts` — chat feature cards: /run launches the local demo run and posts a run card that visibly progresses; the demo run's deploy gate posts an approval card — approve it FROM THE CARD and assert the run completes; /diff posts a diff card; /logs posts a logs card.
2. `inspector.spec.ts` — run inspector surfaces: from a launched demo run, open the inspector (/runs/$runId), its logs view, its timeline, and a diff view; assert each renders that run's data.
3. `reviewSurfaces.spec.ts` — /issues, /tickets, /landings each open their board surface.
4. `notifications.spec.ts` — a run reaching its approval gate raises a toast/notification; assert it appears and can be acted on or dismissed.

Success criteria: all four specs green via the verify command; UI-driven, deterministic, gif-worthy (visible state changes).

## Verify command (must exit 0)

```bash
pnpm -C apps/smithers exec playwright test --config playwright.real.config.ts tests/e2e-real/featureCards.spec.ts tests/e2e-real/inspector.spec.ts tests/e2e-real/reviewSurfaces.spec.ts tests/e2e-real/notifications.spec.ts
```
