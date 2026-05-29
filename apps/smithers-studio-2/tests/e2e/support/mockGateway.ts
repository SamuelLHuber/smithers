import type { Page, Route } from "@playwright/test";

/**
 * Shape every other spec can override. Each field is a realistic fixture for one
 * workspace HTTP surface. Specs pass a partial override and the helper fills the
 * rest with sensible defaults, so a test that only cares about recents does not
 * have to hand-roll auth/operations payloads.
 *
 * Routes are intercepted at the NETWORK layer (Playwright route interception)
 * exactly like tests/e2e/jjhub-parity.spec.ts: the REAL component + workspaceApi
 * code runs, only fetch is stubbed.
 */
export type MockGatewayState = {
  workspace: { cwd: string; root: string; hasSmithers: boolean };
  auth: { apiUrl: string | null; loggedIn: boolean; tokenSet: boolean; tokenSource: string | null; user: string | null; email: string | null; message: string | null };
  recents: Array<{ path: string; displayName: string; exists: boolean; hasSmithers: boolean; smithersPath: string | null; lastOpenedAt: string }>;
  issues: Array<{ id: string; number: number; title: string; body: string | null; state: string; labels: string[]; assignees: string[]; commentCount: number }>;
  landings: Array<{ id: string; number: number; title: string; description: string | null; state: string; targetBranch: string; author: string; createdAt: string; reviewStatus: string | null }>;
  workspaces: Array<{ id: string; name: string; status: string; createdAt: string }>;
  snapshots: Array<{ id: string; workspaceId: string; name: string; createdAt: string }>;
  /**
   * Extra route handlers keyed by the path after `/__smithers_studio/api`. Return
   * a JSON-able value to fulfill, or undefined to fall through to the 404. Use
   * this for surface-specific endpoints (prompts, changes, sql, memory, ...).
   */
  extraRoutes: Record<string, (route: Route, body: Record<string, unknown>) => unknown>;
};

function defaultState(): MockGatewayState {
  return {
    workspace: { cwd: "/tmp/studio", root: "/tmp/studio", hasSmithers: true },
    auth: { apiUrl: "https://jjhub.local", loggedIn: true, tokenSet: true, tokenSource: "env", user: "studio-user", email: "studio@smithers.dev", message: null },
    recents: [
      { path: "/Users/will/projects/alpha", displayName: "alpha", exists: true, hasSmithers: true, smithersPath: "/Users/will/projects/alpha/.smithers", lastOpenedAt: "2026-05-27T12:00:00Z" },
      { path: "/Users/will/projects/beta", displayName: "beta", exists: true, hasSmithers: false, smithersPath: null, lastOpenedAt: "2026-05-26T09:30:00Z" },
    ],
    issues: [
      { id: "issue-11", number: 11, title: "Fix panel refresh", body: "Use workspace routes.", state: "open", labels: ["bug"], assignees: ["will"], commentCount: 2 },
      { id: "issue-12", number: 12, title: "Closed issue", body: null, state: "closed", labels: [], assignees: [], commentCount: 0 },
    ],
    landings: [
      { id: "landing-7", number: 7, title: "Ship parity panels", description: "Land issues, workspaces, and landings.", state: "open", targetBranch: "main", author: "will", createdAt: "2026-05-27T12:00:00Z", reviewStatus: "pending" },
    ],
    workspaces: [
      { id: "ws-1", name: "studio-main", status: "running", createdAt: "2026-05-27T12:00:00Z" },
      { id: "ws-2", name: "studio-paused", status: "suspended", createdAt: "2026-05-26T12:00:00Z" },
    ],
    snapshots: [
      { id: "snap-1", workspaceId: "ws-1", name: "before-restore", createdAt: "2026-05-27T12:30:00Z" },
    ],
    extraRoutes: {},
  };
}

function readBody(route: Route): Record<string, unknown> {
  try {
    return (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function handleApi(route: Route, state: MockGatewayState) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace("/__smithers_studio/api", "");
  const method = request.method();
  const body = readBody(route);

  const extra = state.extraRoutes[path];
  if (extra) {
    const result = extra(route, body);
    if (result !== undefined) return route.fulfill({ json: result as object });
  }

  if (path === "/auth/status") return route.fulfill({ json: { auth: state.auth } });

  if (path === "/local-workspaces" && method === "GET") return route.fulfill({ json: { recents: state.recents } });
  if (path === "/local-workspaces/open" && method === "POST") {
    return route.fulfill({ json: { workspace: { id: "ws-open", name: String(body.path), status: "running", createdAt: "2026-05-28T00:00:00Z" } } });
  }
  if (path === "/local-workspaces" && method === "DELETE") {
    state.recents = state.recents.filter((entry) => entry.path !== String(body.path));
    return route.fulfill({ json: { recents: state.recents } });
  }

  if (path === "/issues" && method === "GET") {
    const filter = url.searchParams.get("state");
    const issues = filter ? state.issues.filter((issue) => issue.state === filter) : state.issues;
    return route.fulfill({ json: { issues } });
  }
  if (path === "/issues" && method === "POST") {
    const issue = { id: "issue-21", number: 21, title: String(body.title), body: (body.body as string | null) ?? null, state: "open", labels: [], assignees: [], commentCount: 0 };
    state.issues.unshift(issue);
    return route.fulfill({ json: { issue } });
  }
  const issueClose = path.match(/^\/issues\/(\d+)\/close$/);
  if (issueClose) {
    const issue = state.issues.find((entry) => entry.number === Number(issueClose[1]))!;
    issue.state = "closed";
    return route.fulfill({ json: { issue } });
  }
  const issueReopen = path.match(/^\/issues\/(\d+)\/reopen$/);
  if (issueReopen) {
    const issue = state.issues.find((entry) => entry.number === Number(issueReopen[1]))!;
    issue.state = "open";
    return route.fulfill({ json: { issue } });
  }
  const issueDetail = path.match(/^\/issues\/(\d+)$/);
  if (issueDetail) {
    return route.fulfill({ json: { issue: state.issues.find((entry) => entry.number === Number(issueDetail[1])) } });
  }

  if (path === "/landings" && method === "GET") return route.fulfill({ json: { landings: state.landings } });
  if (path === "/landings" && method === "POST") {
    const landing = { id: "landing-8", number: 8, title: String(body.title), description: (body.body as string | null) ?? null, state: "open", targetBranch: (body.target as string) ?? "main", author: "will", createdAt: "2026-05-27T13:00:00Z", reviewStatus: null };
    state.landings.unshift(landing);
    return route.fulfill({ json: { landing } });
  }
  const landingNumber = path.match(/^\/landings\/(\d+)(?:\/(diff|checks|conflicts|review|land))?$/);
  if (landingNumber) {
    const landing = state.landings.find((entry) => entry.number === Number(landingNumber[1]))!;
    if (!landingNumber[2]) return route.fulfill({ json: { landing } });
    if (landingNumber[2] === "diff") return route.fulfill({ json: { diff: "diff --git a/app.tsx b/app.tsx\n@@ -1 +1 @@\n-old\n+new" } });
    if (landingNumber[2] === "checks") return route.fulfill({ json: { checks: "typecheck: success\nbuild: success" } });
    if (landingNumber[2] === "conflicts") return route.fulfill({ json: { conflicts: { conflictStatus: "conflicts", hasConflicts: true, conflicts: [{ filePath: "src/App.tsx", conflictType: "content", resolved: false }] } } });
    if (landingNumber[2] === "review") {
      landing.reviewStatus = String(body.action);
      return route.fulfill({ json: { landing } });
    }
    landing.state = "merged";
    return route.fulfill({ json: { landing } });
  }

  if (path === "/workspaces" && method === "GET") return route.fulfill({ json: { workspaces: state.workspaces } });
  if (path === "/workspaces" && method === "POST") {
    const workspace = { id: `ws-${state.workspaces.length + 1}`, name: String(body.name), status: "running", createdAt: "2026-05-27T14:00:00Z" };
    state.workspaces.unshift(workspace);
    return route.fulfill({ json: { workspace } });
  }
  if (path === "/workspaces/snapshots" && method === "GET") return route.fulfill({ json: { snapshots: state.snapshots } });
  if (path === "/workspaces/snapshots" && method === "POST") {
    const snapshot = { id: `snap-${state.snapshots.length + 1}`, workspaceId: String(body.workspaceId), name: String(body.name), createdAt: "2026-05-27T14:30:00Z" };
    state.snapshots.unshift(snapshot);
    return route.fulfill({ json: { snapshot } });
  }
  const snapshotDelete = path.match(/^\/workspaces\/snapshots\/([^/]+)$/);
  if (snapshotDelete && method === "DELETE") {
    state.snapshots = state.snapshots.filter((entry) => entry.id !== snapshotDelete[1]);
    return route.fulfill({ json: { ok: true } });
  }
  const workspaceAction = path.match(/^\/workspaces\/([^/]+)\/(suspend|resume|fork)$/);
  if (workspaceAction) {
    const workspace = state.workspaces.find((entry) => entry.id === workspaceAction[1])!;
    if (workspaceAction[2] === "suspend") workspace.status = "suspended";
    if (workspaceAction[2] === "resume") workspace.status = "running";
    if (workspaceAction[2] === "fork") {
      const forked = { id: "ws-fork", name: String(body.name), status: "running", createdAt: "2026-05-27T15:00:00Z" };
      state.workspaces.unshift(forked);
      return route.fulfill({ json: { workspace: forked } });
    }
    return route.fulfill({ json: { ok: true } });
  }
  const workspaceDelete = path.match(/^\/workspaces\/([^/]+)$/);
  if (workspaceDelete && method === "DELETE") {
    state.workspaces = state.workspaces.filter((entry) => entry.id !== workspaceDelete[1]);
    return route.fulfill({ json: { ok: true } });
  }

  return route.fulfill({ status: 404, json: { error: `Unhandled fixture route ${method} ${path}` } });
}

/**
 * Stub the workspace probe and every `/__smithers_studio/api/*` route with
 * realistic in-memory fixtures. Call once at the top of a test, optionally
 * overriding any slice of state. Returns the mutable state object so a spec can
 * assert against (or further mutate) the fixture between interactions.
 *
 * @example
 * const state = await mockGateway(page);
 * // disconnected gateway: every workspace call rejects
 * await mockGateway(page, { connected: false });
 */
export async function mockGateway(
  page: Page,
  overrides: Partial<MockGatewayState> & { connected?: boolean } = {},
): Promise<MockGatewayState> {
  const { connected = true, ...stateOverrides } = overrides;
  const state: MockGatewayState = { ...defaultState(), ...stateOverrides };

  if (!connected) {
    await page.route("**/__smithers_studio/workspace", (route) => route.abort("failed"));
    await page.route("**/__smithers_studio/api/**", (route) => route.abort("failed"));
    return state;
  }

  await page.route("**/__smithers_studio/workspace", (route) => route.fulfill({ json: state.workspace }));
  await page.route("**/__smithers_studio/api/**", (route) => handleApi(route, state));
  return state;
}
