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

async function launchRun(page: Page, text: string) {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");

  const card = page.getByRole("log").getByTestId("run-card").last();
  await expect(card).toBeVisible();
  await expect(card.locator(".status-pill")).toHaveText(/running|waiting/, {
    timeout: 8_000,
  });
}

test.describe("real launch run flow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("launches runs from plain language and the feature slash entrypoint", async ({ page }) => {
    await launchRun(page, "ship the auth refactor");
    await launchRun(page, "/run the auth refactor");
  });
});
