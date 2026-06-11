import { expect, test } from "@playwright/test";

// Public dev token seeded by Plue compose in $PLUE_DIR/db/seed.sql.
const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

test("signs in with the real seeded Plue token", async ({ page, request }) => {
  const anonymousUser = await request.get("/api/user");
  expect(anonymousUser.status()).toBe(401);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Smithers" })).toBeVisible();

  await page.locator("#login-token").fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();

  const authStatus = page.getByTestId("auth-status");
  await expect(authStatus.locator(".auth-name")).toHaveText("Alice Dev");

  await page.reload();
  await expect(authStatus.locator(".auth-name")).toHaveText("Alice Dev");
});
