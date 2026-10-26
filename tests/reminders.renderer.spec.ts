import { expect, test, type Page } from '@playwright/test';

/** Reminders on elements ring a desktop notification when they come due (#79). */
const pane = (page: Page) => page.locator('.react-flow__pane');

async function emptyCanvas(page: Page) {
  // Record notifications instead of showing them; the browser build uses the web Notification API.
  await page.addInitScript(() => {
    const shown: { title: string; body?: string }[] = [];
    (window as any).__notifications = shown;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      onclick: (() => void) | null = null;
      constructor(title: string, opts?: { body?: string }) {
        shown.push({ title, body: opts?.body });
      }
    }
    (window as any).Notification = FakeNotification;
  });
  await page.goto('/');
  await page.locator('.react-flow__node').first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const s = (window as any).useFlowCanvasStore.getState();
    s.setNodes([]);
    s.setEdges([]);
  });
}

async function writeText(page: Page, text: string) {
  await page.locator("button[title^='Text (T)']").click();
  await pane(page).click({ position: { x: 400, y: 300 } });
  await page.getByPlaceholder('Type something in markdown...').fill(text);
  await page.keyboard.press('Escape');
  return page.evaluate(() => {
    const texts = (window as any).useFlowCanvasStore.getState().nodes.filter((n: any) => n.type === 'text');
    return texts[texts.length - 1].id as string;
  });
}

const nodeData = (page: Page, id: string) =>
  page.evaluate((id) => (window as any).useFlowCanvasStore.getState().nodes.find((n: any) => n.id === id)?.data, id);

test.describe('element reminders', () => {
  test.beforeEach(async ({ page }) => emptyCanvas(page));

  test('a reminder set from the toolbar shows a badge and can be removed', async ({ page }) => {
    const id = await writeText(page, 'Call the dentist');
    await page.getByRole('button', { name: 'Remind me' }).click();
    const before = Date.now();
    await page.getByRole('button', { name: 'In 1 hour' }).click();

    if (process.env.REMINDER_SHOTS) await page.screenshot({ path: `${process.env.REMINDER_SHOTS}/badge.png` });
    const data = await nodeData(page, id);
    expect(data.reminderAt).toBeGreaterThanOrEqual(before + 59 * 60_000);
    await expect(page.locator(`[data-reminder-badge="${id}"]`)).toBeVisible();

    await page.getByRole('button', { name: 'Edit reminder' }).click();
    if (process.env.REMINDER_SHOTS) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${process.env.REMINDER_SHOTS}/panel.png` });
    }
    await page.getByRole('button', { name: 'Remove reminder' }).click();
    expect((await nodeData(page, id)).reminderAt).toBeUndefined();
    await expect(page.locator(`[data-reminder-badge="${id}"]`)).toHaveCount(0);
  });

  test('a due reminder notifies once and is marked as rung', async ({ page }) => {
    const id = await writeText(page, '**Ship** the release');
    await page.evaluate((id) => {
      (window as any).useFlowCanvasStore.getState().updateNodeData(id, { reminderAt: Date.now() + 1500 });
    }, id);

    // The browser build checks every 15 seconds.
    await expect
      .poll(() => page.evaluate(() => (window as any).__notifications.length), { timeout: 20_000 })
      .toBe(1);
    expect(await page.evaluate(() => (window as any).__notifications[0])).toEqual({
      title: 'Reminder',
      body: 'Ship the release',
    });
    expect((await nodeData(page, id)).reminderFiredAt).toBeGreaterThan(0);
    await expect(page.locator(`[data-reminder-badge="${id}"]`)).toHaveCount(0);

    // Later checks leave it alone.
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as any).__notifications.length)).toBe(1);
  });
});
