import { expect, test } from "@playwright/test";
import { mockGateway } from "./support/mockGateway";

/**
 * Workspace chat half. Mocks the NETWORK at the route layer (like
 * jjhub-parity.spec.ts) so the REAL AgentChat + useAgentChat + chatApi code
 * runs against stubbed HTTP. Terminal routes are aborted so the PTY/terminal
 * half degrades gracefully without affecting chat.
 */

const SESSION = {
  sessionId: "chat-1",
  model: "claude-opus-4",
  mode: "default",
  blocks: [
    { id: "seed-1", role: "system", content: "Workspace agent ready.", timestampMs: 1_700_000_000_000 },
  ],
};

/** The ordered deltas the mocked runtime replays for one assistant turn. */
const DELTAS = [
  { type: "block", block: { id: "a1", role: "assistant", content: "", timestampMs: 1_700_000_001_000, pending: true } },
  { type: "delta", id: "a1", content: "Here is a plan:\n\n" },
  { type: "delta", id: "a1", content: "```ts\nconst x = 1;\n```\n" },
  { type: "delta", id: "a1", content: "Done with **bold** and `code`." },
  { type: "done", id: "a1" },
];

async function installChat(page: import("@playwright/test").Page) {
  await page.route("**/terminal/ws", (route) => route.abort("connectionrefused"));
  await mockGateway(page, {
    // Returning a JSON-able value lets the helper fulfill it; chatApi's message
    // endpoint accepts a `{ deltas }` envelope as the non-streaming path.
    extraRoutes: {
      "/chat/session": () => ({ session: SESSION }),
      "/chat/message": () => ({ deltas: DELTAS }),
    },
  });
}

test.describe("Workspace agent chat", () => {
  test("swaps to chat and renders the seeded session with model/mode", async ({ page }) => {
    await installChat(page);
    await page.goto("/");
    await page.getByTestId("nav.Workspace").click();

    // Terminal is the default segment; its testids stay present.
    await expect(page.getByTestId("terminal-tab")).toHaveCount(1);
    await expect(page.getByTestId("close-terminal")).toBeVisible();

    await page.getByTestId("ws-segment-chat").click();

    await expect(page.getByTestId("agent-chat")).toBeVisible();
    await expect(page.getByTestId("chat-model")).toContainText("claude-opus-4");
    await expect(page.getByTestId("chat-mode")).toContainText("default");
    await expect(page.getByTestId("chat-block")).toHaveCount(1);
    await expect(page.getByTestId("chat-list")).toContainText("Workspace agent ready.");
  });

  test("sends a message and streams the assistant reply with markdown", async ({ page }) => {
    await installChat(page);
    await page.goto("/");
    await page.getByTestId("nav.Workspace").click();
    await page.getByTestId("ws-segment-chat").click();

    const input = page.getByTestId("chat-input");
    await input.fill("Write a plan");
    await page.getByTestId("chat-send").click();

    // User block appears immediately.
    await expect(page.getByTestId("chat-block").filter({ hasText: "Write a plan" })).toBeVisible();

    // Streamed assistant block lands with rendered markdown (code + bold + inline code).
    const assistant = page.locator('[data-testid="chat-block"][data-role="assistant"]');
    await expect(assistant).toContainText("Here is a plan:");
    await expect(assistant.locator(".ws-md-code")).toContainText("const x = 1;");
    await expect(assistant.locator("strong")).toContainText("bold");
    await expect(assistant.locator(".ws-md-inline-code")).toContainText("code");

    // Composer clears and the send button leaves its "Sending…" state (it stays
    // disabled only because the draft is now empty, which is the desired idle).
    await expect(input).toHaveValue("");
    await expect(page.getByTestId("chat-send")).toHaveText("Send");
    await input.fill("ping");
    await expect(page.getByTestId("chat-send")).toBeEnabled();
  });

  test("Enter sends, Shift+Enter inserts a newline", async ({ page }) => {
    await installChat(page);
    await page.goto("/");
    await page.getByTestId("nav.Workspace").click();
    await page.getByTestId("ws-segment-chat").click();

    const input = page.getByTestId("chat-input");
    await input.click();
    await input.pressSequentially("line one");
    await input.press("Shift+Enter");
    await input.pressSequentially("line two");
    await expect(input).toHaveValue("line one\nline two");

    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(page.getByTestId("chat-block").filter({ hasText: "line one" })).toBeVisible();
  });

  test("surfaces an error state when the runtime is unavailable", async ({ page }) => {
    await page.route("**/terminal/ws", (route) => route.abort("connectionrefused"));
    await mockGateway(page);
    // A more specific route registered after the helper wins in Playwright, so
    // the session probe gets a 503 and the hook flips to its error state.
    await page.route("**/__smithers_studio/api/chat/session", (route) =>
      route.fulfill({ status: 503, json: { error: "agent runtime offline" } }),
    );
    await page.goto("/");
    await page.getByTestId("nav.Workspace").click();
    await page.getByTestId("ws-segment-chat").click();

    await expect(page.getByTestId("chat-error")).toContainText("agent runtime offline");
    await expect(page.getByTestId("chat-input")).toBeDisabled();
  });

  test("switching back to terminal keeps terminal testids intact", async ({ page }) => {
    await installChat(page);
    await page.goto("/");
    await page.getByTestId("nav.Workspace").click();
    await page.getByTestId("ws-segment-chat").click();
    await expect(page.getByTestId("agent-chat")).toBeVisible();

    await page.getByTestId("ws-segment-terminal").click();
    await expect(page.getByTestId("agent-chat")).toHaveCount(0);
    await expect(page.getByTestId("terminal-tab")).toHaveCount(1);
    await expect(page.locator(".ghostty-terminal")).toBeVisible();
  });
});
