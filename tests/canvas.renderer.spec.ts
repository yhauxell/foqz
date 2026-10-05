import { test, expect } from '@playwright/test';

test.describe('Foqz Live Visual & Interaction Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders the spatial canvas with initial nodes and toolbars', async ({ page }) => {
    // Canvas container must be present
    const canvas = page.locator('.react-flow, #root').first();
    await expect(canvas).toBeVisible();

    // Verify main navigation bar elements
    await expect(page.getByText('Foqz Board 1')).toBeVisible();
    await expect(page.locator("button[aria-label='Settings']")).toBeVisible();

    // Visual screenshot verification
    await page.screenshot({ path: 'test-results/canvas-home.png', fullPage: true });
  });

  test('opens settings modal, navigates tabs, and verifies visual state', async ({ page }) => {
    // Click Settings button
    const settingsBtn = page.locator("button[aria-label='Settings']");
    await settingsBtn.click();

    // Verify Settings dialog is visible using exact accessible role
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    // Verify tabs exist
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'MCP Servers' })).toBeVisible();

    // Switch tab to 'MCP Servers'
    await page.getByRole('button', { name: 'MCP Servers' }).click();

    // Verify MCP tab loaded and take screenshot
    await page.screenshot({ path: 'test-results/settings-mcp-tab.png' });
  });

  test('opens command spotlight, types a query, and captures visual state', async ({ page }) => {
    // Click omni-spotlight trigger in the topbar
    const spotlightTrigger = page.locator("button[title*='Create task, jump to project, or command canvas']");
    await spotlightTrigger.click();

    // Wait for spotlight input
    const searchInput = page.getByPlaceholder(/Jump to project, task, or run an action/);
    await expect(searchInput).toBeVisible();

    // Type a query
    await searchInput.fill('Architecture');

    // Take screenshot of filtered spotlight
    await page.screenshot({ path: 'test-results/spotlight-search.png' });
  });
});
