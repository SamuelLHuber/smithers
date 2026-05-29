import { expect, test, type Page } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * Developer surfaces (DevTools / SQL Browser / Logs) are registered only when
 * `studio.developerMode` is enabled. These specs flip that flag in localStorage,
 * mock the workspace HTTP API and the gateway HTTP RPC at the network layer
 * (exactly like jjhub-parity), and exercise the REAL surface + data-flow code.
 */

const DEVTOOLS_SNAPSHOT = {
  version: 1,
  runId: "run_alpha",
  frameNo: 7,
  seq: 42,
  root: {
    id: 1,
    type: "workflow",
    name: "DeployWorkflow",
    props: { entry: "deploy.tsx", version: "1" },
    children: [
      {
        id: 2,
        type: "task",
        name: "BuildTask",
        props: { command: "pnpm build" },
        task: { nodeId: "build", kind: "agent", agent: "claude" },
        children: [],
        depth: 1,
      },
    ],
    depth: 0,
  },
};

function resFrame(payload: unknown) {
  return { type: "res", id: "1", ok: true, payload };
}

async function enableDeveloperMode(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("studio.developerMode", "true");
  });
}

async function mockGatewayRpc(page: Page) {
  await page.route("**/v1/rpc/listRuns", (route) =>
    route.fulfill({
      json: resFrame([
        { runId: "run_alpha", workflowKey: "deploy", status: "running", createdAtMs: 1_716_900_000_000 },
        { runId: "run_beta", workflowKey: "test", status: "finished", createdAtMs: 1_716_800_000_000 },
      ]),
    }),
  );
  await page.route("**/v1/rpc/getDevToolsSnapshot", (route) =>
    route.fulfill({ json: resFrame(DEVTOOLS_SNAPSHOT) }),
  );
}

test("DevTools surface renders the unfiltered snapshot tree and node props", async ({ page }) => {
  await enableDeveloperMode(page);
  await mockGateway(page);
  await mockGatewayRpc(page);
  await page.goto("/");

  await page.getByTestId("nav.DevTools").click();
  await expect(page.getByTestId("view.devtools")).toBeVisible();

  // The run picker is populated from listRuns and the tree from getDevToolsSnapshot.
  await expect(page.getByTestId("devtools.run-select")).toBeVisible();
  await expect(page.getByTestId("devtools.row.1")).toContainText("DeployWorkflow");
  await expect(page.getByTestId("devtools.row.2")).toContainText("BuildTask");

  // Selecting a node shows its raw props in the inspector.
  await page.getByTestId("devtools.row.2").click();
  await expect(page.getByTestId("devtools.inspector")).toContainText("command");
  await expect(page.getByTestId("devtools.inspector.task")).toContainText("claude");
});

test("SQL Browser lists tables, loads schema, and runs a read-only query", async ({ page }) => {
  await enableDeveloperMode(page);
  await mockGateway(page, {
    extraRoutes: {
      "/sql/tables": () => ({
        tables: [
          { name: "runs", rowCount: 12, type: "table" },
          { name: "events", rowCount: 340, type: "table" },
        ],
        dbPath: "/tmp/studio/.smithers/smithers.db",
      }),
      "/sql/schema": () => ({
        schema: {
          tableName: "runs",
          columns: [
            { cid: 0, name: "id", type: "TEXT", notNull: true, defaultValue: null, primaryKey: true },
            { cid: 1, name: "status", type: "TEXT", notNull: false, defaultValue: null, primaryKey: false },
          ],
        },
        dbPath: "/tmp/studio/.smithers/smithers.db",
      }),
      "/sql/query": () => ({
        result: { columns: ["id", "status"], rows: [["run_alpha", "running"]] },
        dbPath: "/tmp/studio/.smithers/smithers.db",
      }),
    },
  });
  await page.goto("/");

  await page.getByTestId("nav.SQL Browser").click();
  await expect(page.getByTestId("view.sql")).toBeVisible();

  await expect(page.getByTestId("sql.table.runs")).toBeVisible();
  await page.getByTestId("sql.table.runs").click();
  await expect(page.getByTestId("sql.schema")).toContainText("status");

  await page.getByTestId("sql.run").click();
  await expect(page.getByTestId("sql.results")).toContainText("run_alpha");
});

test("Logs surface renders the global firehose with stats and filters", async ({ page }) => {
  await enableDeveloperMode(page);
  await mockGateway(page, {
    extraRoutes: {
      "/logs": () => ({
        entries: [
          {
            id: "log-1",
            timestamp: "2026-05-28T10:00:00Z",
            level: "error",
            category: "gateway",
            message: "connection refused",
            metadata: null,
            sourcePath: "/tmp/studio/.smithers/logs/gateway.log",
            raw: null,
          },
          {
            id: "log-2",
            timestamp: "2026-05-28T10:00:01Z",
            level: "info",
            category: "runner",
            message: "run started",
            metadata: null,
            sourcePath: "/tmp/studio/.smithers/logs/runner.log",
            raw: null,
          },
        ],
        stats: {
          entryCount: 2,
          sizeBytes: 1024,
          errorCount: 1,
          warningCount: 0,
          categories: [
            { category: "gateway", count: 1 },
            { category: "runner", count: 1 },
          ],
          sources: [],
        },
      }),
    },
  });
  await page.goto("/");

  await page.getByTestId("nav.Logs").click();
  await expect(page.getByTestId("view.logs")).toBeVisible();

  await expect(page.getByTestId("logs.stats")).toContainText("2 entries");
  await expect(page.getByTestId("logs.stream")).toContainText("connection refused");
  await expect(page.getByTestId("logs.stream")).toContainText("run started");
});

test("developer surfaces are unreachable when developer mode is off", async ({ page }) => {
  await mockGateway(page);
  await page.goto("/");
  await expect(page.getByTestId("nav.DevTools")).toHaveCount(0);
  await expect(page.getByTestId("nav.SQL Browser")).toHaveCount(0);
  await expect(page.getByTestId("nav.Logs")).toHaveCount(0);
});
