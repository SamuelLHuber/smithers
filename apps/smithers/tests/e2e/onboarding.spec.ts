import { expect, test } from "@playwright/test";

/**
 * REAL first-run onboarding against the live app. These specs override the
 * suite-wide "already onboarded" storage with empty storage, so the overlay
 * appears the way a brand-new visitor sees it. No mocking: the splash, the
 * scripted conversation, and the proposed workflow graph are all client-side
 * and offline by design, so the whole flow runs without the chat backend.
 */
test.describe("first run", () => {
  // A brand-new visitor: no persisted onboarding flag.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("walks from the splash through the builder to a created workflow", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto("/");

    // Phase 1: the splash with the animated mark and a Get started button.
    await expect(page.locator(".ob-intro .ob-mark")).toBeVisible();
    await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();

    // It advances on its own once the mark settles (or via the button).
    const dialog = page.getByRole("dialog", { name: "Welcome to Smithers" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("what would you like a workflow to do");

    // Phase 2: state a goal that classifies to the Implement template.
    await page
      .getByRole("textbox", { name: "What would you like a workflow to do?" })
      .fill("implement a billing page");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Phase 3: the proposed workflow renders as a live graph. The Implement
    // template defaults its approval gate on, so all three are present.
    const graph = page.locator(".ob-graph");
    await expect(graph.locator(".node-title", { hasText: "Implement" })).toBeVisible();
    await expect(graph.locator(".node-title", { hasText: "Review" })).toBeVisible();
    await expect(graph.locator(".node-title", { hasText: "Your approval" })).toBeVisible();

    // Toggling the approval gate off mutates the graph live.
    await page.getByText("Pause for my approval before it acts").click();
    await expect(graph.locator(".node-title", { hasText: "Your approval" })).toHaveCount(0);

    // Create: the overlay dismisses and the composer is primed with the goal.
    await page.getByRole("button", { name: /Create workflow/ }).click();
    await expect(page.locator(".ob-overlay")).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message Smithers" })).toHaveValue(
      /billing page/i,
    );

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the unsure path recommends the default research-plan-implement workflow", async ({
    page,
  }) => {
    await page.goto("/");

    const dialog = page.getByRole("dialog", { name: "Welcome to Smithers" });
    await expect(dialog).toBeVisible();

    // "I'm not sure yet" submits an empty goal, which takes the recommended
    // default — the richest shape, so research/plan/implement all appear.
    await page.getByRole("button", { name: "I'm not sure yet" }).click();

    const graph = page.locator(".ob-graph");
    await expect(graph.locator(".node-title", { hasText: "Research" })).toBeVisible();
    await expect(graph.locator(".node-title", { hasText: "Plan" })).toBeVisible();
    await expect(graph.locator(".node-title", { hasText: "Implement" })).toBeVisible();
  });
});

test.describe("replay", () => {
  test("the /onboarding slash brings the first run back", async ({ page }) => {
    // This describe inherits the suite default (already onboarded), so the app
    // opens straight to the shell with no overlay.
    await page.goto("/");
    await expect(page.locator(".ob-overlay")).toHaveCount(0);

    const input = page.getByRole("textbox", { name: "Message Smithers" });
    await input.fill("/onboarding");
    await input.press("Enter");

    // The splash returns.
    await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  });
});
