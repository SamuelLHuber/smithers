import { expect, test } from "@playwright/test";

// Public dev token seeded by Plue compose in $PLUE_DIR/db/seed.sql.
const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

test.use({ storageState: { cookies: [], origins: [] } });

test("signs in with the real seeded Plue token", async ({ page }) => {
  await page.goto("/");
  const signInButton = page.getByRole("button", { name: "Sign in" });
  if (await signInButton.isVisible().catch(() => false)) {
    await signInButton.click();
  }
  await expect(page.getByRole("heading", { name: "Sign in to Smithers" })).toBeVisible();

  await page.locator("#login-token").or(page.getByRole("textbox", { name: "Token" })).fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();

  const authStatus = page.getByTestId("auth-status");
  await expect(authStatus.locator(".auth-name")).toHaveText("Alice Dev");

  await page.reload();
  await expect(authStatus.locator(".auth-name")).toHaveText("Alice Dev");
});
