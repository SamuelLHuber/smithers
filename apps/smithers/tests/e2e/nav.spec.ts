import { expect, test } from "@playwright/test";

/**
 * View navigation. The active view (chat / askme / store) is reflected on
 * main.app-shell[data-command], so these assertions stay stable while the
 * React state behind navigation is refactored (zustand store, router).
 *
 * Two ways to switch a view: typing in the composer (plain "store", or a
 * leading "/askme" / "/chat" / "/store" slash), and picking a view from the
 * CommandMenu pill. Both must land on the same data-command.
 */
test.describe("view navigation", () => {
  test("typed commands and the CommandMenu switch the active view", async ({ page }) => {
    await page.goto("/");

    const shell = page.locator("main.app-shell");
    const input = page.getByRole("textbox", { name: "Message Smithers" });

    // Default view is chat.
    await expect(shell).toHaveAttribute("data-command", "chat");

    // Plain-language "store" opens the workflow store.
    await input.fill("store");
    await input.press("Enter");
    await expect(shell).toHaveAttribute("data-command", "store");

    // A leading "/askme" slash switches to the Ask Me view.
    await input.fill("/askme");
    await input.press("Enter");
    await expect(shell).toHaveAttribute("data-command", "askme");

    // "/chat" switches back to chat.
    await input.fill("/chat");
    await input.press("Enter");
    await expect(shell).toHaveAttribute("data-command", "chat");

    // Picking a view from the CommandMenu also changes data-command. The pill's
    // accessible name is the current view's label ("Chat"); the dropdown options
    // are radio menuitems named after each view.
    await page.getByRole("button", { name: "Chat" }).click();
    await page.getByRole("menuitemradio", { name: /Store/ }).click();
    await expect(shell).toHaveAttribute("data-command", "store");
  });
});
