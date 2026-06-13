# t10-slideshow — Self-contained HTML slideshow of the feature gifs, e2e-tested

Build the feature slideshow from the captured gifs, and e2e-test the slideshow itself.

1. `scripts/e2e-real/build-slideshow.ts` — a bun script that reads artifacts/feature-gifs/manifest.json and writes `artifacts/feature-gifs/index.html`: a SELF-CONTAINED slideshow (inline CSS+JS, zero external requests; gifs referenced by relative path gifs/<slug>.gif):
   - title slide: "Smithers — features proven end-to-end", generation date, gif count, and the exact commands to regenerate (capture-gifs.ts then build-slideshow.ts);
   - one slide per manifest entry: a humanized feature title, the gif, and a caption with the spec path that proved it;
   - navigation: ←/→ keys, prev/next buttons, dot indicators, and a "n / total" counter. Stable hooks for the e2e spec: data-testid="slideshow-slide", "slideshow-title", "slideshow-next", "slideshow-prev", "slideshow-dots".
2. `apps/smithers/playwright.slideshow.config.ts` — testDir tests/slideshow, chromium only, NO webServer (the slideshow must work from file://).
3. `apps/smithers/tests/slideshow/slideshow.spec.ts` — page.goto the file:// URL of artifacts/feature-gifs/index.html; assert the slide count equals manifest length + 1 (the title slide); ArrowRight/ArrowLeft and the next/prev buttons navigate; on every gif slide the <img> actually decoded (naturalWidth > 0).

Success criteria: the verify command exits 0, and opening index.html in a plain browser with no server shows the working slideshow.

## Verify command (must exit 0)

```bash
bun scripts/e2e-real/build-slideshow.ts && pnpm -C apps/smithers exec playwright test --config playwright.slideshow.config.ts
```
