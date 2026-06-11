import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const SEEDED_PLUE_TOKEN = "smithers_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
const WORKFLOW_KEY = "e2e-probe";

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

async function safeNodeOutput(request: APIRequestContext, runId: string) {
  const response = await request.post(`/v1/rpc/getNodeOutput`, {
    data: { runId, nodeId: "probe", iteration: 0 },
  });
  if (!response.ok()) return null;
  const frame = await response.json();
  if (!frame.ok) return null;
  return frame.payload;
}

async function waitForRunToFinish(request: APIRequestContext, runId: string) {
  const deadline = Date.now() + 360_000;
  let lastStatus = "";

  while (Date.now() < deadline) {
    const run = await gatewayRpc(request, "getRun", { runId });
    lastStatus = typeof run.status === "string" ? run.status : "";

    if (lastStatus === "finished") {
      return;
    }

    if (lastStatus === "failed" || lastStatus === "cancelled") {
      throw new Error(`Gateway run ${runId} ended ${lastStatus}: ${JSON.stringify(run)}`);
    }

    const output = await safeNodeOutput(request, runId);
    if (output?.status === "failed") {
      throw new Error(`Gateway probe node failed for ${runId}: ${JSON.stringify(output)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Gateway run ${runId} did not finish; last status was ${lastStatus}`);
}

test("launches a real Claude agent workflow on the cwd gateway and shows its output", async ({
  page,
  request,
}) => {
  test.setTimeout(420_000);

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
  await expect(
    page.getByTestId("auth-status").locator(".auth-name"),
  ).toHaveText("Alice Dev");

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
  const launchedRunId = page.url().match(/\/gw\/e2e-probe\/([^/?#]+)/)?.[1] ?? "";
  expect(launchedRunId).toMatch(/\S/);

  const frame = page.frameLocator('[data-testid="gateway-workflow-ui-frame"]');
  await expect(frame.getByTestId("probe-run-id")).toHaveText(launchedRunId);
  const headerStatus = page
    .getByTestId("gateway-run-inspector")
    .locator(".surface-head .status-pill");

  await expect(headerStatus).toHaveText(/running|waiting|ok/, {
    timeout: 30_000,
  });
  await page.getByTestId("gateway-view-inspector").click();
  await waitForRunToFinish(request, launchedRunId);
  await expect(headerStatus).toHaveText("ok", { timeout: 360_000 });
  await page.getByTestId("tree-row-probe").click();
  await expect(page.getByTestId("gateway-node-output")).toContainText(
    /"answer":\s*"\S/,
    { timeout: 30_000 },
  );
});
