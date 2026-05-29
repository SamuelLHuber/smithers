import { expect, test } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * jjhub-restyle: verifies the phase-2 declutter/dark-theme restyle of the three
 * secondary "More" surfaces (Issues / Landings / Workspaces) WITHOUT regressing
 * behavior. Network is mocked at the route layer via the shared mockGateway
 * helper, so the real components + workspaceApi data flow run; only fetch is
 * stubbed. These assertions are intentionally complementary to (not a duplicate
 * of) jjhub-parity.spec.ts: they pin the restyle (theme tokens applied, calmer
 * secondary surface class present) and re-confirm the load-bearing accessible
 * names + testids survive the restyle.
 */

const PAGE_BG = "rgb(12, 14, 22)"; // --bg #0C0E16

async function openMore(page: import("@playwright/test").Page, name: "Issues" | "Landings" | "Workspaces") {
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name }).click();
}

test("Issues restyle: dark secondary surface, calmer rows, behavior preserved", async ({ page }) => {
  await mockGateway(page);
  await openMore(page, "Issues");

  // Accessible name + restyle hook both survive.
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await expect(page.locator(".issues-surface")).toBeVisible();

  // Dark theme: header sits on the page bg token, not a hardcoded light color.
  await expect(page.locator(".issues-surface .view-header")).toHaveCSS("background-color", PAGE_BG);

  // Real data flow still renders the open issue.
  await expect(page.getByText("Fix panel refresh")).toBeVisible();

  // Selecting drives the detail pane (behavior preserved).
  await page.locator(".issue-row", { hasText: "Fix panel refresh" }).click();
  await expect(page.getByRole("heading", { name: /Fix panel refresh/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Issue" })).toBeVisible();
});

test("Landings restyle: dark secondary surface, quiet review block, tabs + actions intact", async ({ page }) => {
  await mockGateway(page);
  await openMore(page, "Landings");

  await expect(page.getByRole("heading", { name: "Landings" })).toBeVisible();
  await expect(page.locator(".landings-surface")).toBeVisible();
  await expect(page.locator(".landings-surface .view-header")).toHaveCSS("background-color", PAGE_BG);

  await page.locator(".landing-row", { hasText: "Ship parity panels" }).click();

  // Detail tabs preserved and reachable.
  await page.getByRole("button", { name: "Diff" }).click();
  await expect(page.locator(".diff-content")).toContainText("diff --git");
  await page.getByRole("button", { name: "Info" }).click();

  // Review block is decluttered but its actions remain reachable + functional.
  await expect(page.locator(".landing-review-section")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Review submitted: approve.")).toBeVisible();
});

test("Workspaces restyle: dark secondary surface, calm cards, row actions reachable", async ({ page }) => {
  await mockGateway(page);
  await openMore(page, "Workspaces");

  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  await expect(page.locator(".workspaces-surface")).toBeVisible();
  await expect(page.locator(".workspaces-surface .view-header")).toHaveCSS("background-color", PAGE_BG);

  await expect(page.getByText("studio-main")).toBeVisible();

  // Status renders as a plain colored label (chip background removed in restyle).
  await expect(page.locator(".workspace-status-running").first())
    .toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  // Per-row actions stayed reachable despite the quieter styling.
  const studioMain = page.locator(".workspace-item", { hasText: "studio-main" });
  await studioMain.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText("Suspended workspace studio-main.")).toBeVisible();
});

test("Issues auth-required state keeps the dark surface and accessible name", async ({ page }) => {
  await mockGateway(page, { auth: { apiUrl: null, loggedIn: false, tokenSet: false, tokenSource: null, user: null, email: null, message: null } });
  await openMore(page, "Issues");

  await expect(page.locator(".issues-surface")).toBeVisible();
  await expect(page.getByText("JJHub Authentication Required")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
});
