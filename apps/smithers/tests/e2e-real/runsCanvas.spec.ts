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

test.describe("real runs canvas", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("renders toolbar, toggles stream mode, and shows empty search state", async ({ page }) => {
    await page.goto("/runs");

    await expect(page.getByTestId("runs-canvas")).toBeVisible();
    await expect(page.getByTestId("runs-toolbar")).toBeVisible();

    const badge = page.getByTestId("runs-stream-badge");
    await expect(badge).toHaveText("Live");
    await badge.click();
    await expect(badge).toHaveText("Polling");
    await badge.click();
    await expect(badge).toHaveText("Live");

    await page.getByTestId("runs-search").fill("zzz-no-such-run-zzz");
    await expect(page.getByText("No runs found.")).toBeVisible();
  });
});
