import type { RouteState } from "./routeStore";

/**
 * Map a resolved location to route state. Pure and decoupled from the route
 * tree: the router owns history and validation, this reads the result. Run
 * surfaces are matched before the bare inspector so the longer paths win.
 */
export function deriveRoute(
  pathname: string,
  search: Record<string, unknown>,
): RouteState {
  const project = typeof search.project === "string" ? search.project : undefined;

  const diff = pathname.match(/^\/runs\/([^/]+)\/diff\/([^/]+)\/?$/);
  if (diff) {
    return {
      view: "home",
      surface: {
        kind: "diff",
        runId: decodeURIComponent(diff[1]),
        diffId: decodeURIComponent(diff[2]),
      },
      project,
    };
  }
  const logs = pathname.match(/^\/runs\/([^/]+)\/logs\/?$/);
  if (logs) {
    return {
      view: "home",
      surface: { kind: "logs", runId: decodeURIComponent(logs[1]) },
      project,
    };
  }
  const timeline = pathname.match(/^\/runs\/([^/]+)\/timeline\/?$/);
  if (timeline) {
    return {
      view: "home",
      surface: { kind: "timeline", runId: decodeURIComponent(timeline[1]) },
      project,
    };
  }
  const inspector = pathname.match(/^\/runs\/([^/]+)\/?$/);
  if (inspector) {
    return {
      view: "home",
      surface: { kind: "inspector", runId: decodeURIComponent(inspector[1]) },
      project,
    };
  }
  if (pathname === "/askme") {
    return { view: "askme", surface: null, project };
  }
  if (pathname === "/store") {
    return { view: "store", surface: null, project };
  }
  return { view: "home", surface: null, project };
}
