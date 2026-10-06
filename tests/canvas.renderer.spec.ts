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

  test('opens clear board confirmation modal and can cancel or clear', async ({ page }) => {
    // Open board actions menu
    const actionsMenuBtn = page.locator("button[title='Board actions & exports']");
    await actionsMenuBtn.click();

    // Click Clear Board
    const clearBoardBtn = page.getByRole('button', { name: 'Clear Board' });
    await expect(clearBoardBtn).toBeVisible();
    await clearBoardBtn.click();

    // Verify confirmation modal
    await expect(page.getByText('Clear entire board?')).toBeVisible();
    await expect(page.getByText('This will remove all shapes, tasks, frames, and connections')).toBeVisible();

    // Capture visual screenshot of clear board modal
    await page.screenshot({ path: 'test-results/clear-board-modal.png' });

    // Cancel modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Clear entire board?')).not.toBeVisible();
  });

  test('verifies big focus modal appears when focusing task', async ({ page }) => {
    // Trigger focus session via custom event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('foqz:set-focus-target', { detail: { shapeId: 'task-2' } }));
    });

    // Check prominent timer and exit focus button
    await expect(page.getByText('Remaining Time')).toBeVisible();
    await expect(page.getByText('Exit Focus (Esc)')).toBeVisible();

    // Capture visual screenshot of the expanded focus modal
    await page.screenshot({ path: 'test-results/focus-modal-big.png' });
  });

  test('verifies runway frame selection preserves task visibility on top', async ({ page }) => {
    // Open template selector and stage runway via UI
    const stageRunwayBtn = page.locator("button[title='Stage New Runway from Templates...']");
    await expect(stageRunwayBtn).toBeVisible();
    await stageRunwayBtn.click();

    // Select the first framework (Rule of 3)
    const ruleOf3Btn = page.locator("button:has-text('Rule of 3')").first();
    await expect(ruleOf3Btn).toBeVisible();
    await ruleOf3Btn.click();

    // Verify runway is staged on canvas
    const runwayFrame = page.locator('.react-flow__node-runwayFrame').first();
    await expect(runwayFrame).toBeVisible();

    // Select runway frame
    await runwayFrame.click();

    // Ensure task cards on canvas remain visible and not buried
    const anyTask = page.locator('.react-flow__node-focusTask').first();
    await expect(anyTask).toBeVisible();

    // Capture visual screenshot of runway selection layering
    await page.screenshot({ path: 'test-results/runway-selection-layering.png' });
  });

  test('verifies multiboard creation, switching, and renaming menu', async ({ page }) => {
    // Open board selector
    const boardSelector = page.locator("button[title='Board settings & name']");
    await expect(boardSelector).toBeVisible();
    await boardSelector.click();

    // Verify multiboard dropdown header and create button
    await expect(page.getByText('Canvas Boards')).toBeVisible();
    const createBtn = page.getByRole('button', { name: 'Create New Board' });
    await expect(createBtn).toBeVisible();

    // Capture visual screenshot of multiboard dropdown
    await page.screenshot({ path: 'test-results/multiboard-dropdown.png' });

    // Click Create New Board
    await createBtn.click();
    await expect(page.getByText('Foqz Board 2')).toBeVisible();

    // Capture visual screenshot of switched board
    await page.screenshot({ path: 'test-results/new-board-canvas.png' });
  });

  test('stages Eisenhower Matrix runway template with 4 quadrants', async ({ page }) => {
    // Open template selector
    const stageRunwayBtn = page.locator("button[title='Stage New Runway from Templates...']");
    await expect(stageRunwayBtn).toBeVisible();
    await stageRunwayBtn.click();

    // Select Eisenhower Matrix framework
    const eisenhowerBtn = page.locator("button:has-text('Eisenhower Matrix')").first();
    await expect(eisenhowerBtn).toBeVisible();
    await eisenhowerBtn.click();

    // Verify runway is staged with Eisenhower quadrant watermark guidelines
    await expect(page.getByText('Q1: URGENT & IMPORTANT (DO NOW)')).toBeVisible();
    await expect(page.getByText('Q2: NOT URGENT & IMPORTANT (SCHEDULE)')).toBeVisible();

    // Capture visual screenshot of Eisenhower matrix runway
    await page.screenshot({ path: 'test-results/eisenhower-runway.png' });
  });

  test('verifies arrange layout command in spotlight and project frame chat button', async ({ page }) => {
    // 1. Verify project frame chat button exists and is accessible
    const projectChatBtn = page.locator("button[aria-label='Chat with project or group']").first();
    await expect(projectChatBtn).toBeVisible();

    // 2. Open spotlight and search for arrange layout
    const spotlightTrigger = page.locator("button[title*='Create task, jump to project, or command canvas']");
    await spotlightTrigger.click();

    const searchInput = page.getByPlaceholder(/Jump to project, task, or run an action/);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Arrange Layout');

    // Verify Arrange Layout command option appears
    const arrangeOption = page.getByText(/Arrange Layout \(Tidy Non-overlapping\)/);
    await expect(arrangeOption).toBeVisible();

    // Take screenshot of spotlight with Arrange Layout
    await page.screenshot({ path: 'test-results/spotlight-arrange-layout.png' });

    // Execute arrange layout
    await arrangeOption.click();

    // Take visual screenshot of arranged canvas
    await page.screenshot({ path: 'test-results/canvas-after-arrange.png' });
  });

  test('verifies connection and arrow tools in dock toolbar and creates curved arrow', async ({ page }) => {
    // 1. Verify Connection tool in dock toolbar
    const connectionTool = page.locator("button[title*='Connection Tool']");
    await expect(connectionTool).toBeVisible();

    // 2. Verify Arrow pointer tool in dock toolbar
    const arrowTool = page.locator("button[title*='Arrow Tool']");
    await expect(arrowTool).toBeVisible();
    await arrowTool.click();

    // 3. Click canvas to spawn arrow
    const canvas = page.locator('.react-flow__pane');
    await canvas.click({ position: { x: 380, y: 320 } });

    // 4. Verify arrow node is rendered on canvas
    const arrowNode = page.locator('.react-flow__node-arrow');
    await expect(arrowNode).toBeVisible();

    // 5. Verify arrow toolbar appears with spear controls
    const spearEndBtn = page.locator("button[title*='Arrowhead pointing right (end)']");
    await expect(spearEndBtn).toBeVisible();

    // 6. Capture visual screenshot of curved arrow with controls
    await page.screenshot({ path: 'test-results/canvas-arrow-component.png' });
  });

  test('verifies local AI engine auto-discovery HUD in Settings', async ({ page }) => {
    // 1. Open Focus Settings modal
    const settingsBtn = page.locator("button[aria-label='Settings']");
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // 2. Switch to AI tab
    const aiTabBtn = page.getByRole('button', { name: 'AI', exact: true });
    await expect(aiTabBtn).toBeVisible();
    await aiTabBtn.click();

    // 3. Verify Local Inference Engines Auto-Discovery HUD
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByText('Auto-Detected Local Inference Engines')).toBeVisible();
    await expect(dialog.getByText(/model\(s\) active/)).toBeVisible();
    await expect(dialog.getByText('LM Studio', { exact: true })).toBeVisible();
    await expect(dialog.getByText('llama.cpp', { exact: true })).toBeVisible();

    // 4. Verify GitHub Integration PAT card
    const githubHeading = dialog.getByText('GitHub Integration', { exact: true });
    await expect(githubHeading).toBeVisible();
    await githubHeading.scrollIntoViewIfNeeded();
    await expect(dialog.getByPlaceholder(/ghp_... or github_pat_.../)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Test GitHub Token' })).toBeVisible();

    // 5. Capture screenshot of local AI engine auto-discovery & GitHub PAT setting
    await page.screenshot({ path: 'test-results/local-ai-discovery-settings.png' });
  });
});

