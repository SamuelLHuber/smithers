import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("real stack exposes app, gateway, and Plue through Vite @nogif", async ({ page, request }) => {
  const health = await request.get("/health");
  await expect(health).toBeOK();
  expect(health.headers()["content-type"]).toContain("application/json");
  await expect(health.json()).resolves.toMatchObject({ ok: true });

  const workflows = await request.get("/workflows");
  await expect(workflows).toBeOK();
  expect(workflows.headers()["content-type"]).toContain("application/json");
  const workflowsBody = await workflows.json();
  expect(Array.isArray(workflowsBody.workflows) ? workflowsBody.workflows : workflowsBody).toEqual(
    expect.arrayContaining([expect.any(Object)]),
  );

  await page.goto("/");
  const signInButton = page.getByRole("button", { name: "Sign in" });
  if (await signInButton.isVisible().catch(() => false)) {
    await signInButton.click();
  }
  await expect(page.getByRole("heading", { name: "Sign in to Smithers" })).toBeVisible();
});
