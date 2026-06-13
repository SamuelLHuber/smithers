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

async function submitComposer(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill(text);
  await input.press("Enter");
}

async function openCommandMenu(page: Page) {
  await page
    .getByRole("navigation", { name: "View navigation" })
    .getByRole("button", { name: "Chat" })
    .click();
}

test.describe("real composer navigation @gif", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("routes plain-language, slash commands, and command menu selections", async ({ page }) => {
    await submitComposer(page, "store");
    await expect(page).toHaveURL((url) => url.pathname === "/store");
    await expect(page.getByRole("heading", { name: "Workflow Store" })).toBeVisible();

    await submitComposer(page, "/askme");
    await expect(page).toHaveURL((url) => url.pathname === "/askme");

    await submitComposer(page, "/chat");
    await expect(page).toHaveURL((url) => url.pathname === "/");

    await openCommandMenu(page);
    await page.getByRole("menuitem", { name: "Runs" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/runs");
    await expect(page.getByTestId("runs-canvas")).toBeVisible();

    await openCommandMenu(page);
    await page.getByRole("menuitem", { name: /Find/ }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/palette");
    await expect(page.getByTestId("palette-canvas")).toBeVisible();
  });
});
