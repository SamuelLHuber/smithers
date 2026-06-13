import { expect, test, type Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

async function signIn(page: Page) {
  await page.goto("/");
  const authName = page.getByTestId("auth-status").locator(".auth-name");
  const tokenInput = page.locator("#login-token");
  await expect(authName.or(tokenInput).first()).toBeVisible();
  if (!(await tokenInput.isVisible())) {
    await expect(authName).not.toHaveText("");
    return;
  }

  await tokenInput.fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(authName).not.toHaveText("");
}

test.describe("real first-run onboarding", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("walks the first-run overlay to completion and keeps it dismissed", async ({ page }) => {
    await signIn(page);

    await expect(page.locator(".ob-intro .ob-mark")).toBeVisible();
    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page.locator(".ob-overlay")).toHaveCount(0);
    await expect(page.getByText("Hi, I'm Smithers")).toBeVisible();

    const goalInput = page.getByRole("textbox", {
      name: "What would you like a workflow to do?",
    });
    await goalInput.fill("implement a real stack smoke test");
    await page.getByRole("button", { name: /Continue/ }).click();

    const graph = page.locator(".ob-graph");
    await expect(graph.locator(".node-title", { hasText: "Implement" })).toBeVisible();
    await expect(graph.locator(".node-title", { hasText: "Review" })).toBeVisible();

    await page.getByRole("button", { name: /Create workflow/ }).click();
    await expect(page.locator(".ob-card--done")).toContainText("Created");
    await expect(page.getByRole("textbox", { name: "Message Smithers" })).toHaveValue(
      /real stack smoke test/i,
    );

    await page.reload();
    await expect(page.locator(".ob-overlay")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Get started" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Message Smithers" })).toBeVisible();
  });
});
