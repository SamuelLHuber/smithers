import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const WORKFLOW_KEY = "e2e-probe";

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

test("embeds the real workflow UI and toggles to the run inspector @gif", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);

  const workflows = await request.get("/workflows");
  await expect(workflows).toBeOK();
  const workflowBody = await workflows.json();
  const listed = Array.isArray(workflowBody.workflows)
    ? workflowBody.workflows
    : workflowBody;
  expect(listed).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: WORKFLOW_KEY, hasUi: true }),
    ]),
  );

  await signIn(page);

  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill("store");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Workflow Store" }),
  ).toBeVisible();

  const workflowCard = page.getByTestId(`gateway-wf-${WORKFLOW_KEY}`);
  await expect(workflowCard).toBeVisible();
  await workflowCard.getByRole("button", { name: "Launch" }).click();

  await expect(page).toHaveURL(
    (url) => url.pathname.startsWith(`/gw/${WORKFLOW_KEY}/`),
    { timeout: 15_000 },
  );
  const runId = page.url().match(/\/gw\/e2e-probe\/([^/?#]+)/)?.[1] ?? "";
  expect(runId).toMatch(/\S/);

  const customUi = page.getByTestId("gateway-workflow-ui");
  await expect(customUi).toBeVisible();
  const frame = page.frameLocator('[data-testid="gateway-workflow-ui-frame"]');
  await expect(frame.getByTestId("probe-run-id")).toHaveText(runId);

  await page.getByTestId("gateway-view-inspector").click();
  await expect(page.getByTestId("gateway-run-inspector")).toBeVisible();
  await expect(page.getByTestId("gateway-view-inspector")).toHaveClass(/is-on/);
  await expect(page.locator('[data-testid^="tree-row-"]').first()).toBeVisible();
});
