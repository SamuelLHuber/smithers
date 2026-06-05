import { createRouter } from "@tanstack/react-router";
import { runDiffRoute } from "../diff/runDiffRoute";
import { askMeRoute } from "../askme/askMeRoute";
import { runInspectorRoute } from "../runs/runInspectorRoute";
import { runLogsRoute } from "../runs/runLogsRoute";
import { storeRoute } from "../store/storeRoute";
import { runTimelineRoute } from "../timeline/runTimelineRoute";
import { appHistory } from "./history";
import { homeRoute } from "./homeRoute";
import { rootRoute } from "./rootRoute";

const routeTree = rootRoute.addChildren([
  homeRoute,
  askMeRoute,
  storeRoute,
  runInspectorRoute,
  runLogsRoute,
  runDiffRoute,
  runTimelineRoute,
]);

/** The app's single router. Its history adapts to web vs Electrobun (see appHistory). */
export const router = createRouter({ routeTree, history: appHistory });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
