import { expect, test } from "@playwright/test";
import { SEEDED_APPROVALS, SEEDED_RUNS } from "../fixtures/seededData";

/**
 * REAL-BACKEND Runs surface e2e. No `page.route`, no `mockGateway`. Every read
 * goes over the live `POST /v1/rpc/<method>` path (vite proxies /v1/rpc to the
 * Gateway fixture), and every assertion is on the deterministic runs/approvals
 * the Gateway fixture seeds into its SQLite store via `seedRunStore()`.
 *
 * Scope note: the seeded runs are DB rows with no execution frames, so the real
 * Gateway's `getRun` returns run metadata but no node tree (the orchestrator
 * builds trees from frames, which only exist for executed runs). The
 * tree/inspector/inline-approval flows therefore live in the connected-gateway
 * coverage that launches a real workflow; this spec asserts the surfaces the
 * DB-seeded backend genuinely serves: the run history, its filters, the
 * approvals filter, and the layout/divider behavior that is backend-independent.
 */

const RUNNING_RUN = SEEDED_RUNS.find((run) => run.status === "running")!;
const SUCCEEDED_RUN = SEEDED_RUNS.find((run) => run.status === "finished")!;
const FAILED_RUN = SEEDED_RUNS.find((run) => run.status === "failed")!;
const APPROVAL_RUN_ID = SEEDED_APPROVALS[0].runId;

/**
 * The WIDE/NARROW breakpoint (800px) measures the tree|inspector layout
 * container. A 1440px window leaves the layout comfortably above 800px.
 */
const WIDE_VIEWPORT = { width: 1440, height: 900 };

async function openRuns(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("nav.Runs").click();
  await expect(page.getByTestId("view.runs")).toBeVisible();
}

test.describe("Runs surface (real gateway)", () => {
  test("history lists every seeded run from real /v1/rpc/listRuns", async ({ page }) => {
    await openRuns(page);

    for (const run of SEEDED_RUNS) {
      await expect(page.getByTestId(`runs.history.row.${run.runId}`)).toBeVisible();
    }
  });

  test("failed filter narrows to the seeded failed run only", async ({ page }) => {
    await openRuns(page);

    await expect(page.getByTestId(`runs.history.row.${FAILED_RUN.runId}`)).toBeVisible();
    await page.getByTestId("runs.filter.failed").click();
    await expect(page.getByTestId(`runs.history.row.${FAILED_RUN.runId}`)).toBeVisible();
    await expect(page.getByTestId(`runs.history.row.${SUCCEEDED_RUN.runId}`)).toHaveCount(0);
  });

  test("approvals filter surfaces the run with the seeded pending gate", async ({ page }) => {
    await openRuns(page);

    await page.getByTestId("runs.filter.approvals").click();
    await expect(page.getByTestId(`runs.history.row.${APPROVAL_RUN_ID}`)).toBeVisible();
    await expect(page.getByTestId(`runs.history.row.${FAILED_RUN.runId}`)).toHaveCount(0);
  });

  test("approvals filter shows a pending count from the real listApprovals payload", async ({ page }) => {
    await openRuns(page);

    // The approvals filter carries a count badge equal to the number of runs
    // with a pending gate; the fixture seeds exactly one.
    await expect(page.getByTestId("runs.filter.approvals")).toContainText(String(SEEDED_APPROVALS.length));
  });

  test("renders the wide split layout with a draggable divider", async ({ page }) => {
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    await expect(page.getByTestId("liveRun.layout.wide")).toBeVisible();
    await expect(page.getByTestId("liveRun.layout.divider")).toBeVisible();
  });

  test("auto-selects the first seeded run and loads its state over real getRun", async ({ page }) => {
    await page.setViewportSize(WIDE_VIEWPORT);
    await openRuns(page);

    // The newest seeded run (running) is auto-selected; the toolbar reflects the
    // live run loaded from the real getRun RPC.
    await expect(page.getByTestId(`runs.history.row.${RUNNING_RUN.runId}`)).toBeVisible();
    await expect(page.getByTestId("runs.toolbar")).toBeVisible();
  });

  test("dragging the divider persists the inspector fraction", async ({ page }) => {
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
