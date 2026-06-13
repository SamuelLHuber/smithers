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

function transcriptCard(page: Page, testId: string) {
  return page.getByRole("log").getByTestId(testId);
}

async function launchDemoRun(page: Page) {
  await runCommand(page, "/run real card coverage");
  const card = transcriptCard(page, "run-card").last();
  await expect(card).toBeVisible();
  const runText = await card.locator(".card-sub").textContent();
  const runNumber = runText?.match(/run\s+(\d+)/)?.[1] ?? "";
  expect(runNumber).toMatch(/\d+/);
  return { card, runId: `run-${runNumber}` };
}

test.describe("real-stack chat feature cards", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("/run posts a progressing run card, then approval can be approved from the card", async ({
    page,
  }) => {
    const { card } = await launchDemoRun(page);

    await expect(card.locator(".status-pill")).toHaveText(/running|waiting/, {
      timeout: 8_000,
    });
    await expect(card.locator(".step").first()).toBeVisible();

    const approval = transcriptCard(page, "approval-card").last();
    await expect(approval).toBeVisible({ timeout: 12_000 });
    await expect(approval).toContainText("Approval needed");
    await approval.getByTestId("approval-approve").click();

    await expect(approval).toContainText("Approved · deploy");
    await expect(card.locator(".status-pill")).toHaveText("ok", { timeout: 12_000 });
  });

  test("/diff posts a diff card for the launched run", async ({ page }) => {
    await launchDemoRun(page);
    await runCommand(page, "/diff auth");

    const card = transcriptCard(page, "diff-card").last();
    await expect(card).toBeVisible();
    await expect(card.locator(".card-title")).toContainText("auth refactor");
    await expect(card.locator(".file-tab").first()).toBeVisible();
    await expect(card.locator(".diff-line").first()).toBeVisible();
  });

  test("/logs posts a logs card and opens the logs surface from the card", async ({
    page,
  }) => {
    const { runId } = await launchDemoRun(page);
    await runCommand(page, "/logs");

    const card = transcriptCard(page, "logs-card").last();
    await expect(card).toBeVisible();
    await expect(card).toContainText(`run ${runId.replace("run-", "")}`);
    await expect(card.locator(".log-line").first()).toContainText(/\S/);

    await card.getByRole("button", { name: /Open logs/ }).click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/logs$`));
    await expect(page.getByTestId("logs-canvas")).toContainText("Reading auth/session.ts");
  });
});
