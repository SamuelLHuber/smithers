import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const WORKFLOW_KEY = "e2e-approval-probe";
const APPROVAL_NODE_ID = "approve-probe";
const GATED_NODE_ID = "gated-task";

async function gatewayRpc(
  request: APIRequestContext,
  method: string,
  params: Record<string, unknown>,
) {
  const response = await request.post(`/v1/rpc/${method}`, { data: params });
  await expect(response).toBeOK();
  const frame = await response.json();
  expect(frame).toEqual(expect.objectContaining({ ok: true }));
  return frame.payload;
}

async function waitForStatus(
  request: APIRequestContext,
  runId: string,
  target: string,
) {
  const deadline = Date.now() + 180_000;
  let lastStatus = "";

  while (Date.now() < deadline) {
    const run = await gatewayRpc(request, "getRun", { runId });
    lastStatus = typeof run.status === "string" ? run.status : "";
    if (lastStatus === target) return;
    if (lastStatus === "failed" || lastStatus === "cancelled") {
      throw new Error(`Gateway run ${runId} ended ${lastStatus}: ${JSON.stringify(run)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Gateway run ${runId} did not reach ${target}; last status was ${lastStatus}`);
}

async function waitForGatedOutput(request: APIRequestContext, runId: string) {
  const deadline = Date.now() + 60_000;
  let lastPayload: unknown = null;

  while (Date.now() < deadline) {
    const response = await request.post(`/v1/rpc/getNodeOutput`, {
      data: { runId, nodeId: GATED_NODE_ID, iteration: 0 },
    });
    if (response.ok()) {
      const frame = await response.json();
      if (frame.ok) {
        lastPayload = frame.payload;
        const row = frame.payload?.row ?? frame.payload;
        if (row?.marker === "approval-gated-task-ran") return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Gated task output not found for ${runId}: ${JSON.stringify(lastPayload)}`);
}

test("approves a real gateway approval request from the UI and resumes the run", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);

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

  await page.goto("/");
  await page.locator("#login-token").fill(SEEDED_PLUE_TOKEN);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByTestId("auth-status").locator(".auth-name")).toHaveText("Alice Dev");

  const input = page.getByRole("textbox", { name: "Message Smithers" });
  await input.fill("store");
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: "Workflow Store" })).toBeVisible();

  const workflowCard = page.getByTestId(`gateway-wf-${WORKFLOW_KEY}`);
  await expect(workflowCard).toBeVisible();
  await workflowCard.getByRole("button", { name: "Launch" }).click();

  await expect(page).toHaveURL(
    (url) => url.pathname.startsWith(`/gw/${WORKFLOW_KEY}/`),
    { timeout: 15_000 },
  );
  const runId = page.url().match(/\/gw\/e2e-approval-probe\/([^/?#]+)/)?.[1] ?? "";
  expect(runId).toMatch(/\S/);

  await page.getByTestId("gateway-view-inspector").click();
  await waitForStatus(request, runId, "waiting-approval");

  await expect(page.getByTestId(`tree-row-${APPROVAL_NODE_ID}`)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("gateway-approval-banner")).toContainText(
    "Approve E2E gated task",
    { timeout: 30_000 },
  );
  await page.getByTestId("gateway-approve-button").click();

  await waitForStatus(request, runId, "finished");
  await expect(page.getByTestId("gateway-run-inspector").locator(".surface-head .status-pill")).toHaveText(
    "ok",
    { timeout: 60_000 },
  );
  await waitForGatedOutput(request, runId);
  await page.getByTestId(`tree-row-${GATED_NODE_ID}`).click();
  await expect(page.getByTestId("gateway-node-output")).toContainText(
    "approval-gated-task-ran",
    { timeout: 30_000 },
  );
});
