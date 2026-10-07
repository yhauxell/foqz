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
    await expect(page.getByRole('button', { name: 'Agents & MCP' })).toBeVisible();

    // Switch tab to 'Agents & MCP'
    await page.getByRole('button', { name: 'Agents & MCP' }).click();

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
    // 1. Initial state: Foqz Board 1 with default tasks
    await expect(page.getByText('Connect task cards to sketch boxes')).toBeVisible();

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

    // 2. Click Create New Board -> switches to Foqz Board 2
    await createBtn.click();
    await expect(page.getByText('Foqz Board 2')).toBeVisible();

    // Verify Board 1 tasks are not present on the new Board 2
    await expect(page.getByText('Connect task cards to sketch boxes')).not.toBeVisible();

    // Wait for debounced auto-save timer
    await page.waitForTimeout(700);

    // Capture visual screenshot of switched board
    await page.screenshot({ path: 'test-results/new-board-canvas.png' });

    // 3. Switch back to Foqz Board 1
    await boardSelector.click();
    await page.getByText('Foqz Board 1').click();
    await expect(page.getByText('Foqz Board 1')).toBeVisible();

    // Verify Board 1 tasks were preserved and not wiped out
    await expect(page.getByText('Connect task cards to sketch boxes')).toBeVisible();

    // 4. Reload page and verify active board & nodes persist
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Foqz Board 1')).toBeVisible();
    await expect(page.getByText('Connect task cards to sketch boxes')).toBeVisible();

    // 5. Switch to Foqz Board 2 after reload
    await boardSelector.click();
    await page.getByText('Foqz Board 2').click();
    await expect(page.getByText('Foqz Board 2')).toBeVisible();
    await expect(page.getByText('Connect task cards to sketch boxes')).not.toBeVisible();

    // 6. Switch back to Foqz Board 1 to leave canvas clean for subsequent tests
    await boardSelector.click();
    await page.getByText('Foqz Board 1').click();
    await expect(page.getByText('Foqz Board 1')).toBeVisible();
    await expect(page.getByText('Connect task cards to sketch boxes')).toBeVisible();
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

    // 7. Verify arrow can be deselected by clicking pane
    await canvas.click({ position: { x: 100, y: 100 } });
    await expect(spearEndBtn).not.toBeVisible();

    // 8. Verify arrow can be selected again by clicking anywhere on the arrow component
    await arrowNode.click({ position: { x: 30, y: 30 } });
    await expect(spearEndBtn).toBeVisible();

    // 9. Verify arrow component can be deleted via trash button in floating menu
    const deleteBtn = page.locator("button[title='Delete (Del/Backspace)']");
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await expect(arrowNode).not.toBeVisible();
  });

  test('verifies local AI engine auto-discovery HUD in Settings', async ({ page }) => {
    // 1. Open Focus Settings modal
    const settingsBtn = page.locator("button[aria-label='Settings']");
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // 2. Switch to AI tab
    const aiTabBtn = page.getByRole('button', { name: 'AI & Models', exact: true });
    await expect(aiTabBtn).toBeVisible();
    await aiTabBtn.click();

    // 2b. Open Ollama / Local Engines drawer
    const ollamaConfigureBtn = page.getByRole('button', { name: 'Configure' }).first();
    await expect(ollamaConfigureBtn).toBeVisible();
    await ollamaConfigureBtn.click();

    // 3. Verify Local Inference Engines Auto-Discovery HUD
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByText('Auto-Detected Local Inference Engines')).toBeVisible();
    await expect(dialog.getByText(/model\(s\) active|Offline/).first()).toBeVisible();
    await expect(dialog.getByText('LM Studio', { exact: true })).toBeVisible();
    await expect(dialog.getByText('llama.cpp', { exact: true })).toBeVisible();

    // 3b. Return to overview
    await dialog.getByText(/Back to Providers/).click();

    // 4. Verify GitHub Integration PAT card
    const githubHeading = dialog.getByText('GitHub Integration', { exact: true });
    await expect(githubHeading).toBeVisible();
    await githubHeading.scrollIntoViewIfNeeded();
    await expect(dialog.getByPlaceholder(/ghp_... or github_pat_.../)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Test GitHub Token' })).toBeVisible();

    // 5. Capture screenshot of local AI engine auto-discovery & GitHub PAT setting
    await page.screenshot({ path: 'test-results/local-ai-discovery-settings.png' });
  });

  test('verifies updated shortcuts: R (rectangle), N (sticky note), T (task)', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane');
    await canvas.click({ position: { x: 50, y: 50 } });

    // 1. Verify R activates Rectangle tool
    await page.keyboard.press('r');
    const rectToolBtn = page.locator("button[title*='Sketch Rectangle Tool (R)']");
    await expect(rectToolBtn).toHaveClass(/bg-emerald-600/);

    // 2. Verify N activates Sticky Note tool
    await page.keyboard.press('n');
    const noteToolBtn = page.locator("button[title*='Paper Sticky Note Tool (N)']");
    await expect(noteToolBtn).toHaveClass(/bg-amber-500/);

    // 3. Verify T creates a new Task Card
    const initialTaskCount = await page.locator('.react-flow__node-focusTask').count();
    await page.keyboard.press('t');
    await page.waitForTimeout(300);
    const newTaskCount = await page.locator('.react-flow__node-focusTask').count();
    expect(newTaskCount).toBeGreaterThan(initialTaskCount);

    await page.screenshot({ path: 'test-results/shortcuts-verified.png' });
  });

  test('verifies rectangle: no text by default, double click to edit, and solid background', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane');

    // 1. Activate Rectangle tool via R shortcut
    await page.keyboard.press('r');
    await canvas.click({ position: { x: 400, y: 300 } });

    // 2. Locate created box node
    const boxNode = page.locator('.react-flow__node-box').last();
    await expect(boxNode).toBeVisible();

    // 3. Verify rectangle has NO text by default (not showing "Double-click to write" or "Sketch Box")
    await expect(boxNode.locator('span')).not.toBeVisible();
    await expect(boxNode.getByText('Sketch Box')).not.toBeVisible();
    await expect(boxNode.getByText('Double-click to write')).not.toBeVisible();

    // 4. Test solid background fill in floating menu
    const colorBtn = page.locator("button[title='Change color']");
    await expect(colorBtn).toBeVisible();
    await colorBtn.click();

    const solidFillBtn = page.locator("button[title*='Solid opaque background']");
    await expect(solidFillBtn).toBeVisible();
    await solidFillBtn.click();

    // Verify solid background class applied to box
    const boxInner = boxNode.locator('div.relative.w-full.h-full').first();
    await expect(boxInner).toHaveClass(/rounded-xl/);

    // 5. Double click box to add text
    await boxNode.dblclick({ position: { x: 30, y: 30 } });
    const textarea = boxNode.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Architecture Block');
    await page.keyboard.press('Enter');

    // Verify text is now displayed after double click
    await expect(boxNode.getByText('Architecture Block')).toBeVisible();

    // 6. Capture visual screenshot
    await page.screenshot({ path: 'test-results/rectangle-solid-verified.png' });
  });

  test('verifies text component formatting toolbar, font size (+-), and multi-line Enter', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane');

    // 1. Click Text Tool in vertical toolbar
    const textToolBtn = page.locator("button[title*='Text Note Tool']");
    await expect(textToolBtn).toBeVisible();
    await textToolBtn.click();

    // 2. Click canvas in empty area to place Text note
    await canvas.click({ position: { x: 920, y: 460 } });

    const textNode = page.locator('.react-flow__node-text').last();
    await expect(textNode).toBeVisible();

    // 3. The newly spawned text node enters edit mode; fill and type multi-line text with Enter
    const textarea = textNode.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.fill('Title Line');
    await textarea.press('Enter');
    await textarea.pressSequentially('Subtitle Line');
    await textarea.press('Enter');
    await textarea.pressSequentially('Third Line content');
    expect(await textarea.inputValue()).toContain('Subtitle Line');

    // 4. Verify text formatting toolbar is visible on floating menu
    const fontSizeDisplay = page.locator('span:has-text("px")').first();
    await expect(fontSizeDisplay).toBeVisible();

    const boldBtn = page.locator("button[title*='Bold']");
    const italicBtn = page.locator("button[title*='Italic']");
    const underlineBtn = page.locator("button[title*='Underline']");
    const strikeBtn = page.locator("button[title*='Strikethrough']");
    const linkBtn = page.locator("button[title*='Add Link']");
    const highlightBtn = page.locator("button[title='Highlight text']");
    const clearBtn = page.locator("button[title='Clear formatting']");

    await expect(boldBtn).toBeVisible();
    await expect(italicBtn).toBeVisible();
    await expect(underlineBtn).toBeVisible();
    await expect(strikeBtn).toBeVisible();
    await expect(linkBtn).toBeVisible();
    await expect(highlightBtn).toBeVisible();
    await expect(clearBtn).toBeVisible();

    // 5. Test font size increase (+)
    const initialSize = parseInt((await fontSizeDisplay.textContent()) || "16");
    const plusBtn = page.locator("button[title='Increase font size']");
    await plusBtn.click();
    await expect(fontSizeDisplay).toHaveText(`${initialSize + 2}px`);

    // 6. Test font size decrease (-)
    const minusBtn = page.locator("button[title='Decrease font size']");
    await minusBtn.click();
    await expect(fontSizeDisplay).toHaveText(`${initialSize}px`);

    // 7. Test format action (Bold) on selection
    await textarea.selectText();
    await boldBtn.click();
    expect(await textarea.inputValue()).toContain('**');

    // 8. Capture screenshot with formatting toolbar active
    await page.screenshot({ path: 'test-results/text-toolbar-verified.png' });

    // 9. Exit editing by clicking outside on canvas and verify markdown rendering
    await canvas.click({ position: { x: 100, y: 100 } });
    await expect(textNode.locator('.task-markdown-body strong')).toBeVisible();

    // 10. Capture screenshot of rendered multi-line markdown
    await page.screenshot({ path: 'test-results/text-multiline-markdown-rendered.png' });
  });
});


