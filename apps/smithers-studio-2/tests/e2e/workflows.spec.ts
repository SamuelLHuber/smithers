import { expect, test, type Route } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * Workflows surface e2e. Mocks the workspace HTTP layer at the route boundary
 * (exactly like jjhub-parity) so the REAL Workflows components + workflowsApi
 * data flow run; only fetch is stubbed. Covers: segment switching, list render,
 * source/summary viewing, launching with declared fields + validation, freeform
 * launch, and the launch -> Runs handoff.
 */

const LOCAL_WORKFLOWS = [
  { key: "ship", readableName: "Ship It", description: "Land the current change.", hasUi: true },
  { key: "review", readableName: "Review", description: "Review a diff.", hasUi: false },
];

const SHIP_SOURCE = {
  workflowKey: "ship",
  path: ".smithers/workflows/ship.tsx",
  source: "export const ship = workflow(() => <Task name=\"land\" />);",
  imports: [],
};

const SHIP_GRAPH = {
  workflowKey: "ship",
  path: ".smithers/workflows/ship.tsx",
  mode: "graph",
  message: null,
  tasks: [],
  edges: [],
  fields: [
    { key: "target", name: "target", type: "string", defaultValue: "main", required: true },
    { key: "dryRun", name: "dryRun", type: "boolean", defaultValue: null, required: false },
  ],
  raw: {},
};

async function mockWorkflows(page: import("@playwright/test").Page) {
  const launched: Array<{ workflow: string; input: Record<string, unknown> }> = [];
  await mockGateway(page, {
    extraRoutes: {
      "/workflows": () => ({ workflows: LOCAL_WORKFLOWS }),
      "/jjhub-workflows": () => ({
        workflows: [{ id: 7, name: "nightly-build", path: ".jjhub/nightly.yml", isActive: true }],
      }),
      "/prompts": () => ({ prompts: [{ id: "summarize", entryFile: ".smithers/prompts/summarize.md" }] }),
      "/crons": () => ({
        crons: [{ cronId: "cron-1", workflow: "ship", pattern: "0 9 * * *", enabled: true }],
      }),
      "/workflow-sources/ship": () => ({ workflow: SHIP_SOURCE }),
      "/workflow-sources/ship/graph": () => ({ graph: SHIP_GRAPH }),
      "/runs": (route: Route, body: Record<string, unknown>) => {
        launched.push({ workflow: String(body.workflow), input: (body.input ?? {}) as Record<string, unknown> });
        return { runId: "run-launched-1", workflow: String(body.workflow) };
      },
    },
  });
  return { launched };
}

async function openWorkflows(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByTestId("nav.Workflows").click();
  await expect(page.getByTestId("view.workflows")).toBeVisible();
}

test("lists local workflows and switches segments", async ({ page }) => {
  await mockWorkflows(page);
  await openWorkflows(page);

  await expect(page.getByTestId("wf.row.ship")).toBeVisible();
  await expect(page.getByTestId("wf.row.review")).toBeVisible();

  await page.getByTestId("wf.segment.remote").click();
  await expect(page.getByTestId("wf.row.jjhub:7")).toBeVisible();

  await page.getByTestId("wf.segment.prompts").click();
  await expect(page.getByTestId("wf.row.summarize")).toBeVisible();

  await page.getByTestId("wf.segment.schedules").click();
  await expect(page.getByTestId("wf.row.cron-1")).toBeVisible();
  await expect(page.getByTestId("wf.row.cron-1")).toContainText("0 9 * * *");
});

test("views workflow source", async ({ page }) => {
  await mockWorkflows(page);
  await openWorkflows(page);

  await page.getByTestId("wf.row.ship").click();
  await expect(page.getByTestId("wf.detail")).toBeVisible();
  await page.getByTestId("wf.detail.tab.source").click();
  await expect(page.getByTestId("wf.detail.source")).toContainText("ship = workflow");
});

test("launches with declared fields and routes to Runs", async ({ page }) => {
  const { launched } = await mockWorkflows(page);
  await openWorkflows(page);

  await page.getByTestId("wf.row.ship").click();
  // Declared fields render; default value is prefilled.
  const target = page.getByTestId("wf.launch.field.target");
  await expect(target).toHaveValue("main");
  await target.fill("release");
  await page.getByTestId("wf.launch.field.dryRun").selectOption("true");

  await page.getByTestId("wf.launch.button").click();

  // Routed to Runs (the new run is handed off via the surface-local slice).
  await expect(page.getByTestId("view.runs")).toBeVisible();
  expect(launched).toHaveLength(1);
  expect(launched[0]).toEqual({ workflow: "ship", input: { target: "release", dryRun: true } });
});

test("blocks launch on a required-field validation error", async ({ page }) => {
  const { launched } = await mockWorkflows(page);
  await openWorkflows(page);

  await page.getByTestId("wf.row.ship").click();
  await page.getByTestId("wf.launch.field.target").fill("");
  await page.getByTestId("wf.launch.button").click();

  await expect(page.getByTestId("wf.launch.field-error.target")).toBeVisible();
  await expect(page.getByTestId("view.workflows")).toBeVisible();
  expect(launched).toHaveLength(0);
});

test("launches a prompt via the freeform JSON input", async ({ page }) => {
  const { launched } = await mockWorkflows(page);
  await openWorkflows(page);

  await page.getByTestId("wf.segment.prompts").click();
  await page.getByTestId("wf.row.summarize").click();

  await page.getByTestId("wf.launch.freeform").fill('{"topic":"release notes"}');
  await page.getByTestId("wf.launch.button").click();

  await expect(page.getByTestId("view.runs")).toBeVisible();
  expect(launched).toEqual([{ workflow: "summarize", input: { topic: "release notes" } }]);
});

test("surfaces a list load error", async ({ page }) => {
  await mockGateway(page);
  // Register a more specific route AFTER the catch-all so it wins (Playwright
  // matches the most-recently-added handler first) and can return a non-200.
  await page.route("**/__smithers_studio/api/workflows", (route) =>
    route.fulfill({ status: 500, json: { error: "discovery failed" } }),
  );
  await openWorkflows(page);
  await expect(page.getByTestId("wf.list.error")).toContainText("discovery failed");
});
