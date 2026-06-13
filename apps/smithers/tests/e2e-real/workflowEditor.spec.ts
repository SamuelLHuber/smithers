import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page) {
  await page.goto("/");
  const tokenInput = page.locator("#login-token").or(page.getByRole("textbox", { name: "Token" }));
  if (!(await tokenInput.isVisible().catch(() => false))) {
    const signInButton = page.getByRole("button", { name: "Sign in" });
    if (await signInButton.isVisible().catch(() => false)) {
      await signInButton.click();
    }
  }
  await tokenInput.fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByTestId("auth-status").locator(".auth-name"),
  ).toHaveText("Alice Dev");
}

test("opens the real ralph workflow editor canvas and runs doctor @gif", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/workflow/ralph");

  const sourceEditor = page.getByTestId("wfe-source-editor");
  await expect(sourceEditor).toBeVisible();
  await expect(sourceEditor).toHaveValue(/\S/);

  await page.getByRole("button", { name: "Launch", exact: true }).click();
  await expect(page.getByTestId("wfe-doctor")).toBeVisible();
  await expect(page.getByTestId("wfe-dag")).toBeVisible();

  await page.getByTestId("wfe-run-doctor").click();
  await expect(
    page.locator(".wfe-doctor-issue, .wfe-doctor-summary").first(),
  ).toBeVisible();
});
