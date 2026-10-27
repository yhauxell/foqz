import { test, expect, type Page } from '@playwright/test';

/**
 * Board durability in a plain browser (no disk): unreadable boards are kept, not overwritten, and
 * failed saves are shown. The disk side is covered by storage.electron.spec.ts.
 */

const BOARD_KEY = 'foqz_reactflow_poc_board_v1';
const KEPT_KEY = 'foqz_board_unreadable:board-default';

async function seedOnce(page: Page, entries: Record<string, string>) {
  await page.addInitScript((entries) => {
    if (localStorage.getItem('__storageSeeded')) return;
    localStorage.setItem('__storageSeeded', '1');
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, entries);
}

test('a board that cannot be read is kept, not replaced by the demo board', async ({ page }) => {
  const broken = '{"nodes": [ {"id": "a", "type": "text", "data": {"text": "my work"';
  await seedOnce(page, { [BOARD_KEY]: broken });
  await page.goto('/');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('couldn’t be read');
  await expect(page.getByText('React Flow Migration Milestone')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/storage-unreadable.png' });

  // Autosave runs (600 ms) without destroying the original data.
  await page.waitForTimeout(1500);
  expect(await page.evaluate((k) => localStorage.getItem(k), KEPT_KEY)).toBe(broken);

  await page.getByRole('button', { name: 'Start empty' }).click();
  await expect(alert).toBeHidden();
});

test('a failed save is shown, and retrying clears it once saving works', async ({ page }) => {
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if ((window as any).__failSaves && k === key) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return setItem.call(this, k, v);
    };
  }, BOARD_KEY);
  await page.goto('/');
  await page.locator('.react-flow__node').first().waitFor();

  await page.evaluate(() => {
    (window as any).__failSaves = true;
    const s = (window as any).useFlowCanvasStore.getState();
    s.setNodes([...s.nodes, { id: 'quota-note', type: 'text', position: { x: 40, y: 40 }, data: { text: 'big' } }]);
  });
  const indicator = page.getByRole('button', { name: 'Not saved' });
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('title', /quota has been exceeded/);
  await page.screenshot({ path: 'test-results/storage-not-saved.png' });

  await page.evaluate(() => ((window as any).__failSaves = false));
  await indicator.click();
  await expect(indicator).toBeHidden();
  const saved = await page.evaluate((k) => localStorage.getItem(k), BOARD_KEY);
  expect(saved).toContain('quota-note');
});
