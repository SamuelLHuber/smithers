import { expect, test, type Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

async function signIn(page: Page) {
  await page.goto("/");
  const authName = page.getByTestId("auth-status").locator(".auth-name");
  const tokenInput = page.locator("#login-token");
  await expect(authName.or(tokenInput).first()).toBeVisible();
  if (await tokenInput.isVisible()) {
    await tokenInput.fill(SEEDED_PLUE_TOKEN);
    await page.getByRole("button", { name: "Connect" }).click();
  }
  await expect(authName).not.toHaveText("");
}

test.describe("real-stack approval notifications", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("a run reaching its approval gate raises a toast that can be dismissed", async ({
    page,
  }) => {
    const input = page.getByRole("textbox", { name: "Message Smithers" });
    await input.fill("/run notification coverage");
    await input.press("Enter");
    await expect(page.getByRole("log").getByTestId("run-card").last()).toBeVisible();

    const toast = page.locator(".toast-stack .toast", { hasText: "1 approval waiting" });
    await expect(toast).toBeVisible({ timeout: 12_000 });
    await expect(page.locator(".toast-stack")).toHaveAttribute("aria-live", "polite");
    await toast.locator(".toast-main").click();
    await expect(toast.locator(".toast-menu")).toBeVisible();
    await toast.getByRole("menuitem", { name: "Dismiss" }).click();
    await expect(toast).toHaveCount(0);
  });
});
