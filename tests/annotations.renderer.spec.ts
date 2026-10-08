import { test, expect } from '@playwright/test';

test.describe('Foqz Annotations Flow (Figma/Miro-style AI Context)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('verifies Comment tool (C) in toolbar, drops annotation pin, and opens thread', async ({ page }) => {
    // 1. Verify Annotation/Comment Tool button in toolbar
    const commentTool = page.locator("button[title*='Annotation & Comment Tool']");
    await expect(commentTool).toBeVisible();

    // 2. Click Comment tool
    await commentTool.click();

    // 3. Click canvas background to place a pin
    const canvasPane = page.locator('.react-flow__pane');
    await canvasPane.click({ position: { x: 900, y: 350 } });

    // 4. Verify AnnotationComposer popover appears
    const composer = page.getByPlaceholder(/Type annotation feedback, decisions, or questions/);
    await expect(composer).toBeVisible();

    // 5. Fill and post the annotation
    await composer.fill('AI constraint: Ensure backward compatibility with existing tasks');
    await page.getByRole('button', { name: 'Post' }).click();

    // 6. Verify annotation pin exists on canvas
    const pin = page.locator('.z-35').first();
    await expect(pin).toBeVisible();

    // 7. Verify Annotations panel toggle in topbar
    const panelToggle = page.locator("button[aria-label='Annotations Panel']");
    await expect(panelToggle).toBeVisible();
    await panelToggle.click();

    // 8. Verify Annotations drawer shows the newly posted annotation
    await expect(page.getByText('Ensure backward compatibility').first()).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'test-results/annotation-pin-created.png' });
  });

  test('opens Annotations drawer, toggles filters, and closes', async ({ page }) => {
    const panelToggle = page.locator("button[aria-label='Annotations Panel']");
    await panelToggle.click();

    const drawer = page.locator('aside').filter({ hasText: 'Annotations' });
    await expect(drawer).toBeVisible();

    // Verify filter pills
    await expect(page.getByRole('button', { name: /Open/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Resolved/ })).toBeVisible();

    // Close drawer
    const closeBtn = drawer.locator("button[title='Close Annotations Panel']");
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('verifies node annotate action opens composer and annotation pin is draggable', async ({ page }) => {
    // 1. Select first task card
    const firstTask = page.locator('.react-flow__node-focusTask').first();
    await firstTask.click();

    // 2. Click Annotate button
    const annotateBtn = page.getByRole('button', { name: /Annotate/ }).first();
    await expect(annotateBtn).toBeVisible();
    await annotateBtn.click();

    // 3. Verify composer opens instead of immediately creating a dummy annotation
    const composer = page.getByPlaceholder(/Type annotation feedback, decisions, or questions/);
    await expect(composer).toBeVisible();

    // 4. Fill and submit
    await composer.fill('Refactor validation checks');
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(composer).not.toBeVisible();

    // 5. Verify pin has draggable cursor styling
    const pin = page.locator('.z-35 [style*="position: absolute"]').first();
    await expect(pin).toBeVisible();
    await expect(pin).toHaveClass(/cursor-grab/);

    // 6. Test dragging pin
    const box = await pin.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
      await page.mouse.up();
    }

    await page.screenshot({ path: 'test-results/dragged-annotation-pin.png' });
  });
});
