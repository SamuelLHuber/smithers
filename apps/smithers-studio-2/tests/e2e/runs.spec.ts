import { expect, test, type Page, type Route } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * Deterministic route-mocked tests for the Runs surface. Like jjhub-parity,
 * these intercept the NETWORK (the Gateway RPC at `/v1/rpc/<method>`) and let
 * the real component + data-flow code run. The Gateway speaks a response frame
 * `{ type: "res", ok: true, payload }`, so `rpc(...)` is what we fulfill.
 */

type GatewayState = {
  runs: Array<{ runId: string; workflowKey: string; status: string; createdAtMs: number }>;
  run: Record<string, unknown>;
  approvals: Array<Record<string, unknown>>;
  submittedApprovals: Array<{ runId: string; nodeId: string; approved: boolean }>;
  cancelled: string[];
};

function ok(payload: unknown) {
  return { type: "res", id: "1", ok: true, payload };
}

function defaultGatewayState(): GatewayState {
  return {
    runs: [
      { runId: "run-live-001", workflowKey: "deploy", status: "running", createdAtMs: 1_716_000_000_000 },
      { runId: "run-done-002", workflowKey: "build", status: "succeeded", createdAtMs: 1_715_000_000_000 },
      { runId: "run-fail-003", workflowKey: "test", status: "failed", createdAtMs: 1_714_000_000_000 },
    ],
    run: {
      runId: "run-live-001",
      workflowKey: "deploy",
      status: "running",
      frameCount: 3,
      tree: {
        id: "root",
        type: "workflow",
        name: "deploy",
        status: "running",
        children: [
          { id: "plan", type: "task", name: "plan", status: "succeeded", keyProps: "agent=claude", children: [] },
          {
            id: "approve",
            type: "task",
            name: "approve",
            status: "waiting-approval",
            children: [],
          },
          { id: "ship", type: "task", name: "ship", status: "running", lastLog: "uploading bundle…", children: [] },
        ],
      },
    },
    approvals: [
      {
        runId: "run-live-001",
        workflowKey: "deploy",
        nodeId: "approve",
        iteration: 0,
        requestTitle: "Approve production deploy",
        requestSummary: "Ship build 42 to prod?",
        requestedAtMs: 1_716_000_100_000,
      },
    ],
    submittedApprovals: [],
    cancelled: [],
  };
}

async function fulfillRpc(route: Route, state: GatewayState) {
  const method = new URL(route.request().url()).pathname.split("/").pop();
  let body: Record<string, unknown> = {};
  try {
    body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }

  switch (method) {
    case "listRuns":
      return route.fulfill({ json: ok(state.runs) });
    case "listApprovals":
      return route.fulfill({ json: ok(state.approvals) });
    case "getRun":
      return route.fulfill({ json: ok(state.run) });
    case "getNodeOutput":
      return route.fulfill({ json: ok({ status: "produced", row: { result: "ok", nodeId: body.nodeId } }) });
    case "getNodeDiff":
      return route.fulfill({ json: ok({ summary: { filesChanged: 1 }, files: [{ path: "src/app.ts", patch: "+added" }] }) });
    case "submitApproval": {
      const decision = (body.decision ?? {}) as { approved?: boolean };
      state.submittedApprovals.push({
        runId: String(body.runId),
        nodeId: String(body.nodeId),
        approved: Boolean(decision.approved),
      });
      // Remove the resolved gate so a refresh reflects it.
      state.approvals = state.approvals.filter((entry) => entry.nodeId !== body.nodeId);
      return route.fulfill({ json: ok({ runId: body.runId, nodeId: body.nodeId, iteration: 0, approved: Boolean(decision.approved) }) });
    }
    case "cancelRun":
      state.cancelled.push(String(body.runId));
      return route.fulfill({ json: ok({ runId: body.runId, status: "cancelling" }) });
    case "resumeRun":
      return route.fulfill({ json: ok({ runId: body.runId, status: "resume_requested" }) });
    case "rewindRun":
      return route.fulfill({ json: ok({ ok: true, newFrameNo: 1 }) });
    default:
      return route.fulfill({ json: ok([]) });
  }
}

async function installGateway(page: Page, state: GatewayState) {
  await mockGateway(page);
  await page.route("**/v1/rpc/**", (route) => fulfillRpc(route, state));
}

async function openRuns(page: Page) {
  await page.goto("/");
  await page.getByTestId("nav.Runs").click();
  await expect(page.getByTestId("view.runs")).toBeVisible();
}

/**
 * The WIDE/NARROW breakpoint (800px) measures the tree|inspector layout
 * container, which sits inside the surface after the sidebar + run-history
 * rail. A 1440px window leaves the layout comfortably above 800px; the narrow
 * test uses a 600px window so the layout container falls below the breakpoint.
 */
const WIDE_VIEWPORT = { width: 1440, height: 900 };

test.describe("Runs surface", () => {
  test("renders the wide split layout with a state-colored tree", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    await expect(page.getByTestId("liveRun.layout.wide")).toBeVisible();
    await expect(page.getByTestId("liveRun.layout.divider")).toBeVisible();

    // Tree rows carry stable per-node testids and state data.
    await expect(page.getByTestId("tree.row.root")).toBeVisible();
    await expect(page.getByTestId("tree.row.plan")).toHaveAttribute("data-state", "succeeded");
    await expect(page.getByTestId("tree.row.approve")).toHaveAttribute("data-state", "waiting-approval");
    await expect(page.getByTestId("tree.row.ship")).toHaveAttribute("data-state", "running");

    // The running leaf shows its last-log via the running cursor.
    await expect(page.getByTestId("tree.row.ship")).toContainText("uploading bundle");
  });

  test("history list filters runs and surfaces the approvals filter", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await openRuns(page);

    await expect(page.getByTestId("runs.history.row.run-live-001")).toBeVisible();
    await expect(page.getByTestId("runs.history.row.run-done-002")).toBeVisible();

    // Failed filter narrows to the failed run only.
    await page.getByTestId("runs.filter.failed").click();
    await expect(page.getByTestId("runs.history.row.run-fail-003")).toBeVisible();
    await expect(page.getByTestId("runs.history.row.run-done-002")).toHaveCount(0);

    // Approvals filter keeps the run with a pending gate.
    await page.getByTestId("runs.filter.approvals").click();
    await expect(page.getByTestId("runs.history.row.run-live-001")).toBeVisible();
    await expect(page.getByTestId("runs.history.row.run-fail-003")).toHaveCount(0);
  });

  test("selecting a node opens the inspector and switches tabs", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    await page.getByTestId("tree.row.plan").click();
    await expect(page.getByTestId("runs.inspector")).toBeVisible();

    await page.getByTestId("runs.inspector.tab.output").click();
    await expect(page.getByTestId("runs.inspector.panel.output")).toContainText("plan");

    await page.getByTestId("runs.inspector.tab.diff").click();
    await expect(page.getByTestId("runs.inspector.panel.diff")).toContainText("src/app.ts");
  });

  test("inline approval gate approves and clears the pending count", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    await page.getByTestId("tree.row.approve").click();
    await expect(page.getByTestId("runs.approvalGate")).toBeVisible();
    await expect(page.getByTestId("runs.approvalGate")).toContainText("Approve production deploy");

    await page.getByTestId("runs.approvalGate.note").fill("ship it");
    await page.getByTestId("runs.approvalGate.approve").click();

    await expect.poll(() => state.submittedApprovals.length).toBe(1);
    expect(state.submittedApprovals[0]).toMatchObject({ runId: "run-live-001", nodeId: "approve", approved: true });
  });

  test("cancel posts cancelRun for the live run", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    await expect(page.getByTestId("runs.toolbar")).toBeVisible();
    await page.getByTestId("runs.toolbar.cancel").click();
    await expect.poll(() => state.cancelled).toContain("run-live-001");
  });

  test("narrow viewport opens the inspector as a modal sheet", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize({ width: 600, height: 800 });
    await openRuns(page);

    await expect(page.getByTestId("liveRun.layout.narrow")).toBeVisible();
    await page.getByTestId("tree.row.plan").click();
    await expect(page.getByTestId("liveRun.layout.inspectorSheet")).toBeVisible();

    // Tapping the dimmer (outside the centered sheet) closes the sheet.
    await page.getByTestId("liveRun.layout.sheetDimmer").click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId("liveRun.layout.inspectorSheet")).toHaveCount(0);
  });

  test("dragging the divider persists the inspector fraction", async ({ page }) => {
    const state = defaultGatewayState();
    await installGateway(page, state);
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    const divider = page.getByTestId("liveRun.layout.divider");
    const box = await divider.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    const stored = await page.evaluate(() => localStorage.getItem("liverun.layout.inspectorFraction"));
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0.46);
  });
});
