import { test, expect } from '@playwright/test';

test.describe('Foqz Done Lifecycle & Logbook Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('opens Logbook drawer from Waypoint Rail and verifies UI structure', async ({ page }) => {
    // Locate Logbook button on Waypoint Rail
    const logbookRailBtn = page.locator("button[aria-label='Open Logbook']");
    await expect(logbookRailBtn).toBeVisible();

    // Click to open drawer
    await logbookRailBtn.click();

    // Verify Logbook dialog is visible
    const logbookDialog = page.getByRole('dialog', { name: 'Logbook' });
    await expect(logbookDialog).toBeVisible();

    // Verify title and search bar
    await expect(logbookDialog.getByText('Finished Work')).toBeVisible();
    const searchInput = logbookDialog.getByPlaceholder(/Search historical completed tasks/i);
    await expect(searchInput).toBeVisible();

    // Verify Sweep Now button is present
    await expect(logbookDialog.getByRole('button', { name: /Sweep Now/i })).toBeVisible();

    // Visual screenshot of Logbook drawer
    await page.screenshot({ path: 'test-results/logbook-drawer-open.png' });

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(logbookDialog).not.toBeVisible();
  });

  test('completes task, executes sweep, verifies Undo toast, and restores to canvas', async ({ page }) => {
    // 1. Create a new task via canvas store
    await page.evaluate(() => {
      const store = (window as any).useFlowCanvasStore.getState();
      const taskId = store.createTask({
        title: 'Complete Lifecycle Test Task',
        priority: 1,
        status: 'open',
        position: { x: 700, y: 150 },
      });
      // Mark as done
      store.updateNodeData(taskId, { status: 'done' });
    });

    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/logbook-task-done-on-canvas.png' });

    // 2. Open Logbook drawer and trigger Sweep Now
    const logbookRailBtn = page.locator("button[aria-label='Open Logbook']");
    await logbookRailBtn.click();

    const sweepNowBtn = page.getByRole('button', { name: /Sweep Now/i });
    await sweepNowBtn.click();

    // 3. Verify task appears inside Logbook drawer
    await expect(page.getByText('Complete Lifecycle Test Task')).toBeVisible();
    await page.screenshot({ path: 'test-results/logbook-drawer-populated.png' });

    // Close Logbook
    await page.keyboard.press('Escape');

    // 4. Verify Undo Toast is visible on canvas HUD
    const undoToast = page.getByText(/swept to Logbook/i);
    await expect(undoToast).toBeVisible();

    const undoBtn = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undoBtn).toBeVisible();

    // Take screenshot of Undo HUD
    await page.screenshot({ path: 'test-results/logbook-sweep-undo-toast.png' });

    // 5. Click Undo
    await undoBtn.click();
    await expect(undoToast).not.toBeVisible();

    // 6. Verify task node is restored on canvas
    const restoredTitle = page.locator('.react-flow__node').getByText('Complete Lifecycle Test Task');
    await expect(restoredTitle).toBeVisible();
  });

  test('restores a task from Logbook back onto spatial canvas', async ({ page }) => {
    // 1. Create and sweep a task directly
    await page.evaluate(async () => {
      const store = (window as any).useFlowCanvasStore.getState();
      const taskId = store.createTask({
        title: 'Restorable Project Task',
        priority: 2,
        status: 'open',
      });
      store.updateNodeData(taskId, { status: 'done' });
      await store.sweepCompletedTasks({ force: true });
    });

    // 2. Open Logbook drawer
    const logbookRailBtn = page.locator("button[aria-label='Open Logbook']");
    await logbookRailBtn.click();

    // 3. Find the task in Logbook and click Restore
    await expect(page.getByText('Restorable Project Task')).toBeVisible();
    const restoreBtn = page.getByRole('button', { name: 'Restore' }).last();
    await restoreBtn.click();

    // 4. Close drawer
    await page.keyboard.press('Escape');

    // 5. Verify task is back on canvas
    const canvasNode = page.locator('.react-flow__node').getByText('Restorable Project Task');
    await expect(canvasNode).toBeVisible();

    // Take screenshot of restored canvas state
    await page.screenshot({ path: 'test-results/logbook-task-restored.png' });
  });

  test('verifies swept dependency stub badge on live downstream tasks', async ({ page }) => {
    // 1. Set up Task A (prerequisite) and Task B (dependent)
    await page.evaluate(async () => {
      const store = (window as any).useFlowCanvasStore.getState();
      const taskAId = store.createTask({
        title: 'Prerequisite Database Migration',
        priority: 1,
        status: 'done',
      });
      const taskBId = store.createTask({
        title: 'Dependant API Endpoint',
        priority: 2,
        status: 'open',
        position: { x: 700, y: 150 },
      });
      // Link taskB -> depends on taskA
      store.updateNodeData(taskBId, { dependencies: [taskAId] });

      // Sweep completed task A
      await store.sweepCompletedTasks({ force: true });
    });

    // 2. Verify Task B is on canvas and has the swept dependency stub badge
    const taskBNode = page.locator('.react-flow__node').filter({ hasText: 'Dependant API Endpoint' });
    await expect(taskBNode).toBeVisible();

    // Locate the badge with title indicating swept dependency
    const stubBadge = taskBNode.locator("button[title*='completed dependency(ies) swept to Logbook']");
    await expect(stubBadge).toBeVisible();

    // 3. Click the badge to open popover
    await stubBadge.click();

    // 4. Verify popover content displays the swept prerequisite
    await expect(page.getByText('Swept Dependencies (1)')).toBeVisible();
    await expect(page.getByText('Prerequisite Database Migration')).toBeVisible();

    await page.waitForTimeout(300);

    // Take screenshot of dependency stub popover
    await page.screenshot({ path: 'test-results/logbook-dependency-stub-popover.png' });
  });
});
