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

test.describe("real quick-open palette", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens from /palette, filters, and executes keyboard navigation", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "Message Smithers" });
    await input.fill("/palette");
    await input.press("Enter");

    const card = page.getByRole("log").getByTestId("palette-card");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /Open quick-open/ }).click();
    await expect(page).toHaveURL(/\/palette$/);

    const paletteInput = page.getByTestId("palette-input");
    await paletteInput.click();
    await expect(paletteInput).toBeFocused();
    await paletteInput.fill(">global");
    await expect(page.getByTestId("palette-results")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/palette$/);
    await expect(page.locator(".palette-mode-label")).toContainText(/ask/i);
  });
});
