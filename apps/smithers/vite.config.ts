import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// During e2e the chat gateway (the Cloudflare Worker that owns POST /api/chat)
// runs as its own process on a separate port, pointed at a local deterministic
// OpenAI-compatible upstream. Vite proxies the browser's same-origin /api/chat
// call to it so the app's real fetch path hits a live Worker with NO route
// mocking. Outside e2e (env unset) nothing is proxied and /api/chat 404s under
// `vite dev` exactly as before — production serves the Worker same-origin.
//
// `headers.origin` is rewritten to the proxy target so the Worker's same-origin
// guard (Origin === request URL origin) passes behind the proxy, the same way
// it would when Cloudflare serves the Worker and the app from one origin.
const chatTarget = process.env.SMITHERS_CHAT_PROXY_TARGET;

const proxy: Record<string, string | ProxyOptions> = {};
if (chatTarget) {
  proxy["/api/chat"] = {
    target: chatTarget,
    changeOrigin: true,
    headers: { origin: chatTarget },
  };
}

// Optional Plue-compatible auth API for local remote-mode development. The
// deployed Worker owns this proxy in production; Vite mirrors it for dev and
// preview when pointed at a sibling/local Plue API.
const authTarget = process.env.SMITHERS_AUTH_PROXY_TARGET;
if (authTarget) {
  proxy["/api/auth"] = { target: authTarget, changeOrigin: true };
  proxy["/api/user"] = { target: authTarget, changeOrigin: true };
}

// A connected Smithers gateway (its own process — `smithers up` on
// 127.0.0.1:7331, or the e2e fixture). The app's gateway client and the embedded
// custom-UI iframes call same-origin paths; proxy them to the gateway so the
// browser's real fetch / iframe path runs with NO mocking. Unset (the deployed
// PWA and most dev) leaves the app gateway-less: these paths 404 and the gateway
// store reads that as "offline". `/workflows` can't shadow an app route — the
// router owns none under that prefix.
const gatewayTarget = process.env.SMITHERS_GATEWAY_PROXY_TARGET;
if (gatewayTarget) {
  proxy["/v1/rpc"] = { target: gatewayTarget, changeOrigin: true, ws: true };
  proxy["/health"] = { target: gatewayTarget, changeOrigin: true };
  proxy["/workflows"] = { target: gatewayTarget, changeOrigin: true };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    strictPort: false,
    proxy,
  },
  preview: {
    host: "127.0.0.1",
    port: 4175,
    strictPort: false,
    proxy,
  },
});
