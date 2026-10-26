import { expect, test, type Page } from '@playwright/test';

/** Highlighting a text keeps its source readable and renders a colored mark (#78). */
const pane = (page: Page) => page.locator('.react-flow__pane');

async function emptyCanvas(page: Page) {
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
  const input = page.getByPlaceholder('Type something in markdown...');
  await input.fill(text);
  // Entering edit mode puts the caret at the end a moment later; wait so it does not undo our selection.
  await page.waitForTimeout(120);
  return input;
}

const storedText = (page: Page) =>
  page.evaluate(() => {
    const texts = (window as any).useFlowCanvasStore.getState().nodes.filter((n: any) => n.type === 'text');
    return texts[texts.length - 1].data.text as string;
  });

async function highlightWith(page: Page, color: string) {
  await page.getByRole('button', { name: 'Highlight text' }).click();
  await page.locator(`button[title='Highlight ${color}']`).click();
}

test.describe('text highlight', () => {
  test.beforeEach(async ({ page }) => emptyCanvas(page));

  test('highlighting a selection while editing keeps the source free of HTML', async ({ page }) => {
    const input = await writeText(page, 'some text here');
    await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 9));
    await highlightWith(page, 'Blue');

    await expect(input).toHaveValue('some =={blue}text== here');
    expect(await input.inputValue()).not.toContain('<mark');

    await page.keyboard.press('Escape');
    const mark = page.locator('.task-markdown-body mark');
    await expect(mark).toHaveText('text');
    await expect(mark).toHaveClass(/hl-blue/);
  });

  test('re-highlighting a highlight recolors it instead of nesting', async ({ page }) => {
    const input = await writeText(page, 'some text here');
    await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(5, 9));
    await highlightWith(page, 'Blue');
    await highlightWith(page, 'Green');
    await expect(input).toHaveValue('some =={green}text== here');

    // Same color again removes it.
    await highlightWith(page, 'Green');
    await expect(input).toHaveValue('some text here');
  });

  test('highlighting several lines marks each line and keeps lists intact', async ({ page }) => {
    const input = await writeText(page, '- [ ] first\n- [ ] second');
    await input.evaluate((el: HTMLTextAreaElement) => el.select());
    await highlightWith(page, 'Pink');
    await expect(input).toHaveValue('- [ ] =={pink}first==\n- [ ] =={pink}second==');

    await page.keyboard.press('Escape');
    expect(await storedText(page)).toBe('- [ ] =={pink}first==\n- [ ] =={pink}second==');
    await expect(page.locator('.task-markdown-body mark.hl-pink')).toHaveCount(2);
    await expect(page.locator('.task-markdown-body input[type=checkbox]')).toHaveCount(2);
  });

  test('older <mark style> text still renders and can be cleared', async ({ page }) => {
    const legacy = '<mark style="background-color: #bfdbfe; color: #1e3a8a;">old</mark>';
    let input = await writeText(page, legacy);
    await page.keyboard.press('Escape');
    await expect(page.locator('.task-markdown-body mark')).toHaveText('old');

    await page.keyboard.press('Enter');
    input = page.getByPlaceholder('Type something in markdown...');
    await page.waitForTimeout(120);
    await input.evaluate((el: HTMLTextAreaElement) => el.select());
    await page.getByRole('button', { name: 'Clear formatting' }).click();
    await expect(input).toHaveValue('old');
  });
});
