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
