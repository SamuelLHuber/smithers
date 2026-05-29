import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const ptyTarget = process.env.PTY_SERVER_URL || "http://127.0.0.1:7342";

// During e2e the real Gateway (RPC) and the workspace-API server run on their
// own ports. Vite proxies the browser's same-origin calls to them so the app's
// real `runsGatewayClient` / `workspaceApi` code paths hit a live backend with
// no route mocking. Outside e2e (env unset) only the PTY websocket is proxied.
const gatewayTarget = process.env.SMITHERS_STUDIO_GATEWAY_PROXY_TARGET;
const workspaceApiTarget = process.env.SMITHERS_STUDIO_WORKSPACE_API_PROXY_TARGET;

const proxy: Record<string, string | ProxyOptions> = {
  "/terminal/ws": {
    target: ptyTarget,
    ws: true,
  },
};

if (gatewayTarget) {
  // RPC over HTTP plus the Gateway's run-event websocket (subscribe=<runId>).
  proxy["/v1/rpc"] = { target: gatewayTarget, changeOrigin: true };
  proxy["/health"] = { target: gatewayTarget, changeOrigin: true };
}

if (workspaceApiTarget) {
  proxy["/__smithers_studio"] = { target: workspaceApiTarget, changeOrigin: true };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5190,
    proxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 4190,
  },
});
