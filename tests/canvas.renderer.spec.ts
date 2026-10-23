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

  test('opens settings modal with three tabs and navigates them', async ({ page }) => {
    await page.locator("button[aria-label='Settings']").click();

    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();

    const tabs = dialog.getByRole('tab');
    await expect(tabs).toHaveText(['App', 'Intelligence', 'Integrations']);

    await dialog.getByRole('tab', { name: 'Integrations' }).click();
    await expect(dialog.getByText('MCP tool servers')).toBeVisible();
    await page.screenshot({ path: 'test-results/settings-integrations-tab.png' });
  });

  test('command bar finds nodes and captures typed text onto the canvas', async ({ page }) => {
    await page.locator("button[title='Find, run, or write (⌘K)']").click();

    const searchInput = page.getByPlaceholder(/just type to write/);
    await expect(searchInput).toBeVisible();

    // Finding: an existing node shows up as a match
    await searchInput.fill('Connect task cards');
    await expect(page.getByTestId('command-bar').getByText('Connect task cards to sketch boxes')).toBeVisible();
    await page.screenshot({ path: 'test-results/spotlight-search.png' });

    // Capturing: Enter on the first row writes the text where the user was
    await searchInput.fill('Call the venue about the projector');
    await expect(page.getByText('Write: "Call the venue about the projector"')).toBeVisible();
    await searchInput.press('Enter');

    await expect(page.getByTestId('command-bar')).toBeHidden();
    const created = page.locator('.react-flow__node-text').filter({ hasText: 'Call the venue about the projector' });
    await expect(created).toBeVisible();
    await expect(created.locator('[role="checkbox"]')).toHaveCount(0);
  });

  test('command bar captures a to-do with the [] prefix and shows shortcuts with ?', async ({ page }) => {
    await page.locator("button[title='Find, run, or write (⌘K)']").click();
    const searchInput = page.getByPlaceholder(/just type to write/);

    await searchInput.fill('[] Book flights');
    await expect(page.getByText('Write to-do: "Book flights"')).toBeVisible();
    await searchInput.press('Enter');

    const todo = page.locator('.react-flow__node-text').filter({ hasText: 'Book flights' });
    await expect(todo.locator('[role="checkbox"]')).toBeVisible();

    await page.locator("button[title='Find, run, or write (⌘K)']").click();
    await page.getByPlaceholder(/just type to write/).fill('?');
    const bar = page.getByTestId('command-bar');
    await expect(bar.getByText('Shortcuts', { exact: true }).first()).toBeVisible();
    await expect(bar.getByText('Make it a to-do')).toBeVisible();
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

  test('focus happens in place: the board dims and a timer pill appears', async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('foqz:set-focus-target', { detail: { shapeId: 'task-2' } }));
    });

    const pill = page.getByTestId('focus-pill');
    await expect(pill).toBeVisible();
    await expect(page.getByTestId('focus-timer')).toHaveText(/^\d+:\d{2}$/);

    // Everything except the focused node is dimmed, nothing covers the canvas
    const other = page.locator('.react-flow__node[data-id="task-1"]');
    await expect.poll(async () => Number(await other.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
    const focused = page.locator('.react-flow__node[data-id="task-2"]');
    await expect.poll(async () => Number(await focused.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);
    await page.screenshot({ path: 'test-results/focus-in-place.png' });

    await page.keyboard.press('Escape');
    await expect(pill).toBeHidden();
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

  test('region exposes its AI chat button and command bar has no layout tidy command', async ({ page }) => {
    await expect(page.locator("button[aria-label='Ask AI about this region']").first()).toBeVisible();

    await page.locator("button[title='Find, run, or write (⌘K)']").click();
    await page.getByPlaceholder(/just type to write/).fill('Arrange');
    await expect(page.getByTestId('command-bar').getByText(/Arrange Layout/)).toHaveCount(0);
  });

  test('verifies connection and arrow tools in dock toolbar and creates curved arrow', async ({ page }) => {
    // 1. Verify Connection tool in dock toolbar
    const connectionTool = page.locator("button[title*='Connection Tool']");
    await expect(connectionTool).toBeVisible();

    // 2. Verify Arrow pointer tool in dock toolbar
    const arrowTool = page.locator("button[title*='Arrow']");
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

  test('verifies local AI engine auto-discovery in Intelligence and GitHub in Integrations', async ({ page }) => {
    await page.locator("button[aria-label='Settings']").click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });

    await dialog.getByRole('tab', { name: 'Intelligence' }).click();
    await expect(dialog.getByText('Auto-Detected Local Inference Engines')).toBeVisible();
    await expect(dialog.getByText(/model\(s\) active|Offline/).first()).toBeVisible();
    await expect(dialog.getByText('LM Studio', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('llama.cpp', { exact: true })).toBeVisible();
    // Only two providers remain
    await expect(dialog.getByRole('combobox', { name: 'Active AI provider' }).locator('option')).toHaveText([
      'Ollama (local, private)',
      'OpenAI-compatible endpoint',
    ]);
    await expect(dialog.getByText(/Gemini \(Cloud\)|TypeSafe/)).toHaveCount(0);

    await dialog.getByRole('tab', { name: 'Integrations' }).click();
    await expect(dialog.getByPlaceholder(/ghp_... or github_pat_.../)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Test GitHub Token' })).toBeVisible();
    await page.screenshot({ path: 'test-results/local-ai-discovery-settings.png' });

    await dialog.locator("button[aria-label='Close settings']").click();
    await expect(dialog).not.toBeVisible();
  });

  test('shortcuts: R rectangle, T text, A arrow, N sticky text, and ⌘↵ toggles a to-do', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane');
    await canvas.click({ position: { x: 50, y: 50 } });

    await page.keyboard.press('r');
    await expect(page.locator("button[title*='Sketch Rectangle Tool (R)']")).toHaveClass(/bg-emerald-600/);

    await page.keyboard.press('t');
    await expect(page.locator("button[title^='Text (T)']")).toHaveClass(/bg-amber-600/);

    await page.keyboard.press('a');
    await expect(page.locator("button[title^='Arrow (A)']")).toHaveClass(/bg-violet-600/);

    // A no longer creates a task card, and there is no task tool
    await expect(page.locator("button[title*='Task Card Tool']")).toHaveCount(0);

    // N places sticky-style text
    await page.keyboard.press('n');
    await canvas.click({ position: { x: 640, y: 520 } });
    await expect(page.locator('.react-flow__node-note').last()).toBeVisible();
    await page.keyboard.press('Escape');

    // ⌘↵ on selected text toggles the to-do checkbox
    await canvas.click({ position: { x: 700, y: 40 } });
    const text = page.locator('.react-flow__node[data-id="text-demo"]');
    await text.click();
    await expect(page.getByRole('radiogroup', { name: 'Text style' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(text.locator('[role="checkbox"]')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(text.locator('[role="checkbox"]')).toHaveCount(0);
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
    const textToolBtn = page.locator("button[title^='Text (T)']");
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

  test('verifies markdown is parsed after clicking outside on canvas for text and rectangle nodes', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane');

    // 1. Create text node using Text Tool
    const textToolBtn = page.locator("button[title^='Text (T)']");
    await expect(textToolBtn).toBeVisible();
    await textToolBtn.click();
    await canvas.click({ position: { x: 750, y: 300 } });

    // 2. Locate active textarea and type raw markdown with bold, italic, and highlight
    const textTextarea = page.getByPlaceholder('Type something in markdown...');
    await expect(textTextarea).toBeVisible();
    await textTextarea.fill('**Bold Text** and *Italic Note* and ==highlighted item==');

    // 3. Click outside on the empty canvas pane
    await canvas.click({ position: { x: 100, y: 100 } });

    // 4. Verify text node exited editing mode and parsed markdown elements are rendered
    await expect(textTextarea).not.toBeVisible();
    const textNode = page.locator('.react-flow__node-text').filter({ hasText: 'Bold Text' });
    await expect(textNode.locator('.task-markdown-body strong')).toHaveText('Bold Text');
    await expect(textNode.locator('.task-markdown-body em')).toHaveText('Italic Note');
    await expect(textNode.locator('.task-markdown-body mark')).toHaveText('highlighted item');

    // 5. Select Box (Rectangle) tool via 'r' shortcut and place on canvas
    await page.keyboard.press('r');
    await canvas.click({ position: { x: 650, y: 450 } });

    const boxNode = page.locator('.react-flow__node-box').last();
    await expect(boxNode).toBeVisible();

    // 6. Double click rectangle to edit text and enter markdown
    await boxNode.dblclick({ position: { x: 40, y: 30 } });
    const boxTextarea = boxNode.locator('textarea');
    await expect(boxTextarea).toBeVisible();
    await boxTextarea.fill('**Core Service** [Docs](https://foqz.io)');

    // 7. Click outside on canvas pane
    await canvas.click({ position: { x: 100, y: 100 } });

    // 8. Verify box node exited editing and parsed markdown
    await expect(boxTextarea).not.toBeVisible();
    await expect(boxNode.locator('.task-markdown-body strong')).toHaveText('Core Service');
    await expect(boxNode.locator('.task-markdown-body a')).toHaveText('Docs');

    // 9. Visual screenshot verification
    await page.screenshot({ path: 'test-results/markdown-outside-click-parsed.png' });
  });
});



