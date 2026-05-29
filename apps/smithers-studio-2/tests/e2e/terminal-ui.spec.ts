import { test, expect } from '@playwright/test';

test.describe('Terminal UI', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the terminal WebSocket to avoid a PTY server dependency. page.route
    // does not intercept WebSocket handshakes, so use routeWebSocket and close
    // the socket immediately — the terminal then renders its "PTY server
    // unavailable" state deterministically, independent of any live PTY server.
    await page.routeWebSocket('**/terminal/ws', ws => {
      ws.close();
    });
  });

  test('displays terminal interface correctly', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Should show the terminal component
    await expect(page.locator('.terminal-pane')).toBeVisible();

    // Should show PTY server unavailable message
    await expect(page.locator('.terminal-status')).toContainText(/PTY server unavailable/, { timeout: 5000 });

    // Should still show the Ghostty terminal component structure
    await expect(page.locator('.ghostty-terminal')).toBeVisible();
  });

  test('shows terminal tab management UI', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Should show at least one terminal tab
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(1);

    // Should show terminal close button
    await expect(page.locator('[data-testid="close-terminal"]')).toBeVisible();
    await expect(page.locator('[data-testid="close-terminal"]')).toBeDisabled(); // Only one tab, can't close
  });

  test('opens command palette with keyboard shortcut', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Command palette should not be visible initially
    await expect(page.locator('[data-testid="command-palette"]')).not.toBeVisible();

    // Press Ctrl/Cmd+P to open command palette
    await page.keyboard.press('Meta+p');

    // Command palette should now be visible
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();

    // Should show the "New Terminal" command row inside the palette (scoped to
    // the palette so it does not collide with the sidebar's "+ New terminal").
    await expect(
      page.locator('[data-testid="command-palette"] .palette-row-title', { hasText: 'New Terminal' }),
    ).toBeVisible();
  });

  test('can create new terminal tab via command palette', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Start with 1 tab
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(1);

    // Open command palette
    await page.keyboard.press('Meta+p');
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();

    // Type to filter for new terminal
    await page.keyboard.type('New Terminal');
    await page.keyboard.press('Enter');

    // Should now have 2 tabs
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(2);

    // Close button should now be enabled
    await expect(page.locator('[data-testid="close-terminal"]')).toBeEnabled();
  });

  test('can close terminal tabs', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Create a second terminal tab (wait for the palette to mount, then focus
    // its input before typing so the keystrokes are not dropped before autofocus
    // has settled).
    await page.keyboard.press('Meta+p');
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();
    await page.locator('.palette-input').click();
    await page.keyboard.type('New Terminal');
    await page.keyboard.press('Enter');

    // Should have 2 tabs
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(2);

    // Close the current tab
    await page.locator('[data-testid="close-terminal"]').click();

    // Should be back to 1 tab
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(1);

    // Close button should be disabled again
    await expect(page.locator('[data-testid="close-terminal"]')).toBeDisabled();
  });

  test('can switch between terminal tabs', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Create a second terminal tab (wait for the palette to mount, then focus
    // its input before typing so the keystrokes are not dropped before autofocus
    // has settled).
    await page.keyboard.press('Meta+p');
    await expect(page.locator('[data-testid="command-palette"]')).toBeVisible();
    await page.locator('.palette-input').click();
    await page.keyboard.type('New Terminal');
    await page.keyboard.press('Enter');

    // Should have 2 tabs
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(2);

    // Second tab should be active (has 'active' class or similar visual indication)
    const secondTab = page.locator('[data-testid="terminal-tab"]').nth(1);
    await expect(secondTab).toHaveClass(/active/);

    // Switch tabs via the sidebar terminal tablist (the panes themselves are a
    // stacked, single-visible overlay; the sidebar is the switch affordance).
    // Scope to .sidebar-terminals so the Terminal/Chat segment tablist (also
    // role="tab") is not matched.
    const sidebarTabs = page.locator('.sidebar-terminals [role="tab"]');
    await sidebarTabs.first().click();

    // First terminal pane should now be the active one
    const firstTab = page.locator('[data-testid="terminal-tab"]').first();
    await expect(firstTab).toHaveClass(/active/);
    await expect(secondTab).not.toHaveClass(/active/);
  });

  test('creates new terminal with hotkey', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Start with 1 tab
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(1);

    // Press Ctrl/Cmd+T to create new terminal directly
    await page.keyboard.press('Meta+t');

    // Should now have 2 tabs
    await expect(page.locator('[data-testid="terminal-tab"]')).toHaveCount(2);
  });

  test('handles terminal component lifecycle correctly', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // Terminal should initialize and show unavailable status
    await expect(page.locator('[data-testid="terminal-status"]')).toHaveText('PTY server unavailable — start with: bun scripts/dev.ts');

    // Ghostty terminal component should still be rendered
    await expect(page.locator('.ghostty-terminal')).toBeVisible();

    // Terminal pane should have proper ARIA attributes
    await expect(page.locator('.terminal-pane')).toHaveAttribute('aria-hidden', 'false');
  });

  test('shows loading state during terminal initialization', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/');
    await page.getByTestId("nav.Workspace").click();

    // The Suspense fallback should appear briefly during Ghostty core loading
    // Since this is very fast, we mainly test that the structure is correct

    await expect(page.locator('.terminal-pane')).toBeVisible();

    // Either the loading message OR the error message should be visible
    const hasLoadingOrError = await page.locator('.terminal-loading, .terminal-status').count();
    expect(hasLoadingOrError).toBeGreaterThan(0);
  });
});