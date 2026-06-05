import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { bindRouteStore } from "./app/bindRouteStore";
import { router } from "./app/router";
import { startApprovalWatcher } from "./runs/watchApprovals";
import { registerServiceWorker } from "./registerServiceWorker";
import "./styles.css";

// Wire the router into the route store and bridge run gates to the chat before
// the first paint, so every store is live when the shell mounts.
bindRouteStore(router);
startApprovalWatcher();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

registerServiceWorker();
