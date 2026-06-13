import { describe, expect, test } from "bun:test";
import { deriveRoute } from "./deriveRoute";
import type { RouteState, View } from "./routeStore";
import type { Surface } from "./Surface";

describe("deriveRoute", () => {
  const parameterizedRoutes: { name: string; path: string; expectedSurface: Surface }[] = [
    {
      name: "diff",
      path: "/runs/run%201/diff/diff%202",
      expectedSurface: { kind: "diff", runId: "run 1", diffId: "diff 2" },
    },
    {
      name: "logs",
      path: "/runs/run%201/logs",
      expectedSurface: { kind: "logs", runId: "run 1" },
    },
    {
      name: "timeline",
      path: "/runs/run%201/timeline",
      expectedSurface: { kind: "timeline", runId: "run 1" },
    },
    {
      name: "inspector",
      path: "/runs/run%201",
      expectedSurface: { kind: "inspector", runId: "run 1" },
    },
    {
      name: "gatewayRun",
      path: "/gw/workflow%201/run%202",
      expectedSurface: {
        kind: "gatewayRun",
        workflowKey: "workflow 1",
        runId: "run 2",
      },
    },
    {
      name: "workflowEditor",
      path: "/workflow/workflow%201",
      expectedSurface: { kind: "workflowEditor", id: "workflow 1" },
    },
  ];

  for (const route of parameterizedRoutes) {
    test(`${route.name} matches with and without a trailing slash`, () => {
      for (const pathname of [route.path, `${route.path}/`]) {
        expect(deriveRoute(pathname, {})).toEqual({
          view: "home",
          surface: route.expectedSurface,
          project: undefined,
        });
      }
    });
  }

  const flatRoutes: { path: string; view?: View; surface: Surface | null }[] = [
    { path: "/runs", surface: { kind: "runs" } },
    { path: "/approvals", surface: { kind: "approvals" } },
    { path: "/agents", surface: { kind: "agents" } },
    { path: "/memory", surface: { kind: "memory" } },
    { path: "/prompts", surface: { kind: "prompts" } },
    { path: "/scores", surface: { kind: "scores" } },
    { path: "/crons", surface: { kind: "crons" } },
    { path: "/vcs", surface: { kind: "vcs" } },
    { path: "/issues", surface: { kind: "issues" } },
    { path: "/tickets", surface: { kind: "tickets" } },
    { path: "/landings", surface: { kind: "landings" } },
    { path: "/palette", surface: { kind: "palette" } },
    { path: "/askme", view: "askme", surface: null },
    { path: "/store", view: "store", surface: null },
    { path: "/concierge", view: "concierge", surface: null },
    { path: "/login", view: "login", surface: null },
  ] as const;

  test("maps every flat route", () => {
    for (const route of flatRoutes) {
      const expected: RouteState = {
        view: route.view ?? "home",
        surface: route.surface,
        project: undefined,
      };
      expect(deriveRoute(route.path, {})).toEqual({
        ...expected,
      });
    }
  });

  test("falls back to home with no surface for an unknown path", () => {
    expect(deriveRoute("/does-not-exist", {})).toEqual({
      view: "home",
      surface: null,
      project: undefined,
    });
  });

  test("does not throw when a path segment has malformed percent encoding", () => {
    expect(deriveRoute("/runs/%", {})).toEqual({
      view: "home",
      surface: { kind: "inspector", runId: "%" },
      project: undefined,
    });
  });

  test("passes through a string project on any route", () => {
    const paths = [
      ...parameterizedRoutes.map((route) => route.path),
      ...flatRoutes.map((route) => route.path),
      "/does-not-exist",
    ];

    for (const pathname of paths) {
      expect(deriveRoute(pathname, { project: "smithers" }).project).toBe("smithers");
    }
  });
});
