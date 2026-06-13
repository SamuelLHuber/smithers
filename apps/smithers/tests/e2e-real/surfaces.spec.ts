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

async function postSlashCard(page: Page, command: string, cardTestId?: string) {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill(command);
  await input.press("Enter");

  if (cardTestId) {
    await expect(page.getByRole("log").getByTestId(cardTestId)).toBeVisible();
  }
}

async function openSlashSurface(
  page: Page,
  command: string,
  testId: string,
  open: (page: Page) => Promise<void>,
) {
  await postSlashCard(page, command, command === "/approvals" ? undefined : `${testId.replace("-canvas", "")}-card`);
  await open(page);
  const canvas = page.getByTestId(testId);
  await expect(canvas).toBeVisible();
  await expect(canvas.locator(".surface-head")).toBeVisible();
}

async function openFromCommandMenu(page: Page, name: string | RegExp) {
  await page
    .getByRole("navigation", { name: "View navigation" })
    .getByRole("button", { name: "Chat" })
    .click();
  await page.getByRole("menuitem", { name }).click();
}

async function clickCardLink(page: Page, cardTestId: string, name: string | RegExp) {
  await page.getByRole("log").getByTestId(cardTestId).getByRole("button", { name }).first().click();
}

test.describe("real canvas surfaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const surface of [
    {
      command: "/runs",
      testId: "runs-canvas",
      path: /\/runs$/,
      open: (page: Page) => clickCardLink(page, "runs-card", /Open runs/),
    },
    {
      command: "/approvals",
      testId: "approvals-canvas",
      path: /\/approvals$/,
      open: (page: Page) => openFromCommandMenu(page, "Approvals"),
    },
    {
      command: "/agents",
      testId: "agents-canvas",
      path: /\/agents$/,
      open: (page: Page) => clickCardLink(page, "agents-card", /Open registry/),
    },
    {
      command: "/memory rust",
      testId: "memory-canvas",
      path: /\/memory$/,
      open: (page: Page) => clickCardLink(page, "memory-card", /Open memory/),
    },
    {
      command: "/prompts",
      testId: "prompts-canvas",
      path: /\/prompts$/,
      open: (page: Page) => openFromCommandMenu(page, "Prompts"),
    },
    {
      command: "/scores",
      testId: "scores-canvas",
      path: /\/scores$/,
      open: (page: Page) => clickCardLink(page, "scores-card", /Open scores/),
    },
    {
      command: "/crons",
      testId: "crons-canvas",
      path: /\/crons$/,
      open: (page: Page) => clickCardLink(page, "crons-card", /Open triggers/),
    },
    {
      command: "/workflow",
      testId: "workflow-editor-canvas",
      path: /\/workflow\/[^/]+$/,
      open: (page: Page) => clickCardLink(page, "workflow-editor-card", /Open editor/),
    },
  ]) {
    test(`${surface.command} opens its canvas surface`, async ({ page }) => {
      await openSlashSurface(page, surface.command, surface.testId, surface.open);
      await expect(page).toHaveURL((url) => surface.path.test(url.pathname));
    });
  }
});
