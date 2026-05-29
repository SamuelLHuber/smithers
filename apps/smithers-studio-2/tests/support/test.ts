import { test as base, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { STUDIO_SESSION_HEADER } from "./sessionHeader";

/**
 * The studio-2 e2e `test` — a thin extension of Playwright's that gives every
 * test its OWN isolated workspace-API state so the full suite is deterministic
 * under `fullyParallel: true`.
 *
 * HOW: one shared workspace-API fixture server backs the whole run, but it keys
 * all mutable JJHub / launch / chat-fault state by the `x-studio-session`
 * header (see tests/fixtures/workspaceApiServer.ts). We mint a fresh session id
 * per test and inject it by OVERRIDING the built-in `extraHTTPHeaders` option —
 * which Playwright applies to BOTH the browser `context` (so every page fetch
 * carries it through the vite proxy) AND the `request` fixture (so a spec's
 * `request.get(...)` reads/writes the SAME isolated bucket). Each test therefore
 * sees the seed data fresh, mutations never leak across tests, and absolute
 * counts (e.g. "Loaded 1 issue", created issue #103) stay deterministic no
 * matter how many tests run concurrently.
 *
 * The Gateway fixture needs NO session keying: its reads are stable seeded rows
 * and its mutations (approve / deny / cancel) already act on dedicated
 * per-spec run ids, so parallel tests never collide on Gateway state.
 *
 * Specs MUST import { test, expect } from "../support/test" (NOT
 * "@playwright/test") to inherit this isolation.
 */
export const test = base.extend<{ studioSessionId: string }>({
  // Per-test unique session id. Auto so a spec never has to request it.
  studioSessionId: [
    async ({}, use, testInfo) => {
      await use(`t-${testInfo.parallelIndex}-${randomUUID()}`);
    },
    { auto: true },
  ],

  // Merge the per-test session header into whatever headers the config set.
  // Overriding this option fixture flows into both the browser context and the
  // `request` fixture, so page fetches and direct API calls share one bucket.
  extraHTTPHeaders: async ({ extraHTTPHeaders, studioSessionId }, use) => {
    await use({
      ...(extraHTTPHeaders ?? {}),
      [STUDIO_SESSION_HEADER]: studioSessionId,
    });
  },
});

export { expect };
