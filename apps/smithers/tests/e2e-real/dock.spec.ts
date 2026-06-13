import { expect, test, type Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

async function signIn(page: Page) {
  if (page.url() === "about:blank") {
    await page.goto("/");
  }
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

test.describe("real app dock", () => {
  test("opens an app from the dock and persists dock state across reload", async ({ page }) => {
    await signIn(page);
    await page.goto("/runs");

    const dock = page.getByRole("toolbar", { name: "Open apps" });
    const trigger = page.locator(".app-dock-trigger");
    await trigger.hover();
    await expect(dock.getByRole("button", { name: "Runs", exact: true })).toBeVisible();

    await page.goto("/");
    await trigger.hover();
    await dock.getByRole("button", { name: "Runs", exact: true }).click();
    await expect(page).toHaveURL(/\/runs$/);
    await expect(page.getByTestId("runs-canvas")).toBeVisible();

    await page.reload();
    await signIn(page);
    await page.waitForURL(/\/runs$/);
    await trigger.hover();
    await expect(dock.getByRole("button", { name: "Runs", exact: true })).toBeVisible();
    await expect(page.getByTestId("runs-canvas")).toBeVisible();
  });
});
