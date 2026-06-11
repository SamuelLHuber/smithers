import { expect, test } from "@playwright/test";

test.describe("real stack boot", () => {
  async function expectJson(response: { headers: () => Record<string, string> }) {
    expect(response.headers()["content-type"]).toContain("application/json");
  }

  test("proxies the app origin to the real gateway health endpoint", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    await expectJson(response);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("proxies the app origin to the cwd gateway workflow pack", async ({ request }) => {
    const response = await request.get("/workflows");

    expect(response.status()).toBe(200);
    await expectJson(response);
    const body = await response.json();
    const workflows = Array.isArray(body) ? body : body.workflows;
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThan(0);
  });

  test("proxies anonymous auth to the real Plue API", async ({ request }) => {
    const response = await request.get("/api/user");

    expect(response.status()).toBe(401);
    await expectJson(response);
    expect(await response.json()).toEqual(expect.any(Object));
  });

  test("loads the app shell", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Sign in to Smithers" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect/ })).toBeVisible();
  });
});
