import { expect, test } from "@playwright/test";

test("real stack exposes app, gateway, and Plue through Vite", async ({ page, request }) => {
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

  const user = await request.get("/api/user");
  expect(user.status()).toBe(401);
  expect(user.headers()["content-type"]).toContain("application/json");
  await expect(user.json()).resolves.toEqual(expect.any(Object));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in to Smithers" })).toBeVisible();
});
