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

async function runCommand(page: Page, command: string) {
  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill(command);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

test.describe("real-stack review board surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const surface of [
    { command: "/issues", card: "issues-card", canvas: "issues-canvas", button: /Open issues/, path: /\/issues$/ },
    { command: "/tickets", card: "tickets-card", canvas: "tickets-canvas", button: /Open tickets/, path: /\/tickets$/ },
    { command: "/landings", card: "landings-card", canvas: "landings-canvas", button: /Open landings/, path: /\/landings$/ },
  ]) {
    test(`${surface.command} opens its board surface`, async ({ page }) => {
      await runCommand(page, surface.command);
      const card = page.getByRole("log").getByTestId(surface.card);
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: surface.button }).click();

      await expect(page).toHaveURL((url) => surface.path.test(url.pathname));
      const canvas = page.getByTestId(surface.canvas);
      await expect(canvas).toBeVisible();
      await expect(canvas.locator(".surface-head")).toBeVisible();
      await expect(canvas.locator(".rev-row, [data-testid$='-row']").first()).toBeVisible();
    });
  }
});
