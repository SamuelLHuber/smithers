import { expect, test } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * Discovery surfaces: Memory, Scores, Search. Route-mocked at the network layer
 * (the real components + workspaceApi fetch code run; only fetch is stubbed).
 * Each test renders the surface from the live nav and exercises one interaction.
 */

async function openMoreSurface(page: import("@playwright/test").Page, label: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: label }).click();
}

test("Memory lists facts and filters via search against the real endpoint", async ({ page }) => {
  await mockGateway(page);

  // The /memory route carries query params; a later, more specific route wins.
  const facts = [
    { namespace: "project", key: "build.command", valueJson: "\"pnpm build\"", schemaSig: null, createdAtMs: 1716800000000, updatedAtMs: 1716800000000, ttlMs: null },
    { namespace: "user", key: "preferred.editor", valueJson: "\"vim\"", schemaSig: null, createdAtMs: 1716700000000, updatedAtMs: 1716900000000, ttlMs: null },
  ];
  await page.route("**/__smithers_studio/api/memory?**", (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    const filtered = query
      ? facts.filter((fact) => `${fact.namespace} ${fact.key}`.toLowerCase().includes(query))
      : facts;
    return route.fulfill({ json: { facts: filtered, dbPath: "/tmp/studio/.smithers/memory.db" } });
  });

  await openMoreSurface(page, "Memory");

  await expect(page.getByTestId("view.memory")).toBeVisible();
  await expect(page.getByText("build.command")).toBeVisible();
  await expect(page.getByText("preferred.editor")).toBeVisible();

  // Interaction: filter the list via the server-backed search box.
  await page.getByTestId("memory.search").fill("editor");
  await expect(page.getByText("preferred.editor")).toBeVisible();
  await expect(page.getByText("build.command")).toHaveCount(0);

  // Interaction: select a fact and confirm its detail value renders.
  await page.getByTestId("memory.row").first().click();
  await expect(page.getByTestId("memory.detail")).toContainText("vim");
});

test("Scores renders aggregates and rows from the real endpoint and filters by run", async ({ page }) => {
  await mockGateway(page);

  const scoreRow = (id: string, runId: string, score: number) => ({
    id,
    runId,
    nodeId: "node-1",
    iteration: 0,
    attempt: 0,
    scorerId: "accuracy",
    scorerName: "Accuracy",
    source: "llm",
    score,
    reason: "looks good",
    metaJson: null,
    inputJson: null,
    outputJson: null,
    latencyMs: 120,
    scoredAtMs: 1716800000000,
    durationMs: 100,
  });
  const allRows = [scoreRow("s-1", "run-aaaa1111", 0.92), scoreRow("s-2", "run-bbbb2222", 0.4)];

  await page.route("**/__smithers_studio/api/scores?**", (route) => {
    const url = new URL(route.request().url());
    const runId = url.searchParams.get("runId");
    const scores = runId ? allRows.filter((row) => row.runId === runId) : allRows;
    return route.fulfill({
      json: {
        scores,
        aggregates: [
          { scorerId: "accuracy", scorerName: "Accuracy", count: scores.length, mean: 0.66, min: 0.4, max: 0.92, p50: 0.66, stddev: 0.26 },
        ],
        runs: [
          { runId: "run-aaaa1111", count: 1, latestScoredAtMs: 1716800000000 },
          { runId: "run-bbbb2222", count: 1, latestScoredAtMs: 1716800000000 },
        ],
        tokenMetrics: { totalTokens: 0, totalInputTokens: 0, totalOutputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, byPeriod: [] },
        latencyMetrics: { count: 0, meanMs: 0, minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, byPeriod: [] },
        costReport: { totalCostUSD: 0, inputCostUSD: 0, outputCostUSD: 0, runCount: 0, byPeriod: [] },
        dbPath: "/tmp/studio/.smithers/scores.db",
      },
    });
  });

  await openMoreSurface(page, "Scores");

  await expect(page.getByTestId("view.scores")).toBeVisible();
  await expect(page.getByTestId("scores.aggregates")).toContainText("Accuracy");
  await expect(page.getByTestId("scores.row")).toHaveCount(2);

  // Interaction: scope to a single run.
  await page.getByTestId("scores.runfilter").selectOption("run-aaaa1111");
  await expect(page.getByTestId("scores.row")).toHaveCount(1);
});

test("Search queries the real endpoint and supports scope switching", async ({ page }) => {
  await mockGateway(page);

  await page.route("**/__smithers_studio/api/search?**", (route) => {
    const url = new URL(route.request().url());
    const scope = url.searchParams.get("scope");
    const query = url.searchParams.get("query") ?? "";
    return route.fulfill({
      json: {
        results: [
          {
            id: `${scope}-1`,
            title: `${scope} hit for ${query}`,
            description: `Matched in ${scope}`,
            snippet: null,
            filePath: scope === "code" ? "src/app.ts" : null,
            lineNumber: scope === "code" ? 42 : null,
            kind: scope,
          },
        ],
      },
    });
  });

  await openMoreSurface(page, "Search");

  await expect(page.getByTestId("view.search")).toBeVisible();

  // Interaction: type a query and confirm code-scope results render.
  await page.getByTestId("search.input").fill("refresh");
  await expect(page.getByTestId("search.result")).toContainText("code hit for refresh");
  await expect(page.getByText("src/app.ts:42")).toBeVisible();

  // Interaction: switch scope to issues and confirm the re-query swaps results.
  await page.getByTestId("search.scope.issues").click();
  await expect(page.getByTestId("search.result")).toContainText("issues hit for refresh");
});
