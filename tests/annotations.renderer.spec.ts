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
});
