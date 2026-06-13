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

test.use({ colorScheme: "light" });

test.describe("real theme toggle", () => {
  test("flips light/dark and persists across reload", async ({ page }) => {
    await signIn(page);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });
});
