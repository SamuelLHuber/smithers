# t9-gif-capture — Record every real e2e spec as a feature gif (playwright video → ffmpeg)

Build the gif-capture pipeline that records the real e2e suite as feature gifs.

1. `apps/smithers/playwright.capture.config.ts` — extends playwright.real.config.ts (import the base config object and spread it): video on for every test at a fixed viewport (`use.video = { mode: "on", size: { width: 1280, height: 720 } }`, viewport 1280x720), `outputDir: "capture-results"`, reporter `[["json", { outputFile: "capture-report/report.json" }], ["line"]]`, workers: 1, and the SAME webServer entries reused from the imported base config.
2. Tag API-only tests that produce blank video (e.g. the request-only assertions in tests/e2e-real/stack.spec.ts) with "@nogif" in the test title; the capture script skips those.
3. `scripts/e2e-real/capture-gifs.ts` — a bun script run from the repo root that:
   - runs `pnpm -C apps/smithers exec playwright test --config playwright.capture.config.ts` (inheriting env; a nonzero playwright exit fails the capture);
   - parses apps/smithers/capture-report/report.json; for every PASSED test whose title lacks @nogif, locates its video attachment (.webm);
   - converts each webm → gif with the host ffmpeg using a two-pass palette (`fps=10,scale=960:-1:flags=lanczos` + palettegen/paletteuse) into `artifacts/feature-gifs/gifs/<slug>.gif`, slug = "<spec-file-basename>--<test-title>" kebab-cased;
   - writes `artifacts/feature-gifs/manifest.json`: an array of { slug, title, spec, gif, bytes, durationMs } sorted by spec path;
   - exits NONZERO with a clear message if the playwright run failed, any passed non-@nogif test has no video, any gif is under 20KB, or fewer than 8 gifs were produced. Log a per-test line as it converts (no silent skips).
4. Gitignore the generated output: add `artifacts/` to the repo-root .gitignore and `capture-results/` + `capture-report/` to apps/smithers/.gitignore. Binaries are never committed; the scripts are.

Success criteria: the verify command exits 0 against a warm stack, producing ≥8 gifs and a manifest that matches them. Running it twice is idempotent (prior output replaced).

## Verify command (must exit 0)

```bash
bun scripts/e2e-real/capture-gifs.ts
```
