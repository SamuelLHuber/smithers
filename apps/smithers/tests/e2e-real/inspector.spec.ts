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

async function launchFromChat(page: Page) {
  await runCommand(page, "/run inspector coverage");
  const card = page.getByRole("log").getByTestId("run-card").last();
  await expect(card).toBeVisible();
  const runText = await card.locator(".card-sub").textContent();
  const runNumber = runText?.match(/run\s+(\d+)/)?.[1] ?? "";
  expect(runNumber).toMatch(/\d+/);
  return { card, runId: `run-${runNumber}` };
}

async function dismissToasts(page: Page) {
  const toast = page.locator(".toast-stack .toast").first();
  while (await toast.isVisible().catch(() => false)) {
    await toast.locator(".toast-main").click();
    await toast.getByRole("menuitem", { name: "Dismiss" }).click();
  }
}

test.describe("real-stack run inspector surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("deep links render inspector, logs, timeline, and diff for the launched run", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { card, runId } = await launchFromChat(page);
    await dismissToasts(page);

    await card.getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}$`));
    const inspector = page.getByTestId("run-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.locator(".surface-title")).toContainText("Implement");
    await expect(inspector.locator(".tree-row").first()).toBeVisible();

    await card.getByRole("button", { name: "Logs" }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/logs$`));
    const logs = page.getByTestId("logs-canvas");
    await expect(logs).toBeVisible();
    await expect(logs).toContainText("Reading auth/session.ts");
    await expect(logs.locator(".log-line").first()).toContainText(/\S/);

    await runCommand(page, "/timeline");
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/timeline$`));
    const timeline = page.getByTestId("timeline-canvas");
    await expect(timeline).toBeVisible();
    await expect(timeline.getByTestId("tl-counter")).toContainText("frame");
    await expect(timeline.getByTestId("tl-scrubber")).toBeVisible();

    await runCommand(page, "/diff auth");
    const diffCard = page.getByRole("log").getByTestId("diff-card").last();
    await expect(diffCard).toBeVisible();
    await diffCard.getByRole("button", { name: /Review in canvas/ }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/diff/auth$`));
    const diff = page.getByTestId("diff-canvas");
    await expect(diff).toBeVisible();
    await expect(diff.locator(".surface-title")).toContainText("auth refactor");
    await expect(diff.getByTestId("diff-file-row").first()).toBeVisible();
    await expect(diff.locator(".diff-line").first()).toBeVisible();
  });
});
