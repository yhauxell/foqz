import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Text sizes itself like FigJam or tldraw: height hugs the text, width is automatic
 * until you drag a side, corners scale the font. See docs/specs/text-sizing.md.
 */
const SHOTS = 'docs/specs/text-sizing/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const pane = (page: Page) => page.locator('.react-flow__pane');
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function emptyCanvas(page: Page) {
  await page.goto('/');
  // Clear only after the first fit-to-view, so the canvas stays at its normal zoom.
  await page.locator('.react-flow__node').first().waitFor();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const s = (window as any).useFlowCanvasStore.getState();
    s.setNodes([]);
    s.setEdges([]);
  });
}

/** Writes a new text with the Text tool and returns its id; the text stays in edit mode. */
async function writeText(page: Page, at: { x: number; y: number }, text: string) {
  await page.locator("button[title^='Text (T)']").click();
  await pane(page).click({ position: at });
  await page.getByPlaceholder('Type something in markdown...').fill(text);
  return page.evaluate(() => {
    const texts = (window as any).useFlowCanvasStore.getState().nodes.filter((n: any) => n.type === 'text');
    return texts[texts.length - 1].id as string;
  });
}

/** Box of the node in canvas units (zoom-free), how far its text spills out, and what is stored. */
function geometry(page: Page, id: string) {
  return page.evaluate((id) => {
    const n = (window as any).useFlowCanvasStore.getState().nodes.find((x: any) => x.id === id);
    const wrapper = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
    const content = wrapper.querySelector('textarea, .task-markdown-body') as HTMLElement;
    const w = wrapper.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    const zoom = w.width / wrapper.offsetWidth;
    return {
      zoom,
      width: wrapper.offsetWidth,
      height: wrapper.offsetHeight,
      spillBelow: (c.bottom - w.bottom) / zoom,
      spillRight: (c.right - w.right) / zoom,
      mode: (wrapper.firstElementChild as HTMLElement).dataset.widthMode,
      storedWidth: n.style?.width,
      storedHeight: n.height ?? n.style?.height,
      fontSize: n.data.fontSize,
      x: n.position.x,
      y: n.position.y,
    };
  }, id);
}

async function drag(page: Page, handle: Locator, dx: number, dy = 0) {
  const b = (await handle.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

const ONE_LINE = 50; // 16px text: 23px line + 20px padding, with headroom

test.describe('Text sizing', () => {
  test('auto width hugs the text and shrinks back when text is removed', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Hi');
    let g = await geometry(page, id);
    expect(g.mode).toBe('auto');
    expect(g.width).toBeLessThan(80);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    await shot(page, '01-auto-width-short');

    await node(page, id).dblclick();
    await page.getByPlaceholder('Type something in markdown...').fill('A longer thought that widens the box as you type');
    g = await geometry(page, id);
    expect(g.width).toBeGreaterThan(300);
    expect(g.height).toBeLessThan(ONE_LINE);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    g = await geometry(page, id);
    expect(g.width).toBeGreaterThan(300);
    expect(g.height).toBeLessThan(ONE_LINE);
    await shot(page, '02-auto-width-long');

    await page.evaluate((id) => (window as any).useFlowCanvasStore.getState().updateNodeData(id, { text: 'Hi' }), id);
    await page.waitForTimeout(100);
    g = await geometry(page, id);
    expect(g.width).toBeLessThan(80);
    expect(g.height).toBeLessThan(ONE_LINE);
  });

  test('a bigger font widens an auto-width text instead of wrapping it', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Pricing tiers');
    await page.keyboard.press('Escape');
    const before = await geometry(page, id);
    await page.evaluate((id) => (window as any).useFlowCanvasStore.getState().updateNodeData(id, { fontSize: 32 }), id);
    await page.waitForTimeout(100);
    const after = await geometry(page, id);
    expect(after.width).toBeGreaterThan(before.width * 1.6);
    expect(after.height).toBeLessThan(32 * 1.45 + 30);
  });

  test('auto width stays one line at the right edge of the view, and long pastes wrap at a cap', async ({ page }) => {
    await emptyCanvas(page);
    await page.evaluate(() => {
      (window as any).useFlowCanvasStore.getState().setNodes([
        { id: 'far', type: 'text', position: { x: 1100, y: 200 }, data: { text: 'Far away words stay on one line' } },
        { id: 'paste', type: 'text', position: { x: 100, y: 200 }, data: { text: 'word '.repeat(80).trim() } },
      ]);
    });
    await page.waitForTimeout(150);
    const far = await geometry(page, 'far');
    expect(far.height).toBeLessThan(ONE_LINE);
    const paste = await geometry(page, 'paste');
    expect(paste.width).toBeLessThan(34 * 16 + 30);
    expect(paste.spillBelow).toBeLessThanOrEqual(1);
  });

  test('dragging a side fixes the width; height keeps following the text', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Pricing tiers for the launch page');
    await page.keyboard.press('Escape');
    const start = await geometry(page, id);

    await drag(page, node(page, id).locator('[data-resize="right"]'), (-start.width / 2) * start.zoom);
    let g = await geometry(page, id);
    expect(g.mode).toBe('fixed');
    expect(Number(g.storedWidth)).toBeLessThan(start.width);
    expect(g.storedHeight).toBeUndefined();
    expect(g.height).toBeGreaterThan(start.height); // wrapped onto more lines
    expect(g.spillBelow).toBeLessThanOrEqual(1);
    await page.waitForTimeout(100);
    await shot(page, '03-fixed-width-wraps');

    await page.evaluate(
      (id) =>
        (window as any).useFlowCanvasStore
          .getState()
          .updateNodeData(id, { text: 'Pricing tiers for the launch page\n- Free\n- Pro\n- Team\n- Enterprise' }),
      id
    );
    await page.waitForTimeout(100);
    const tall = await geometry(page, id);
    expect(tall.height).toBeGreaterThan(g.height);
    expect(tall.spillBelow).toBeLessThanOrEqual(1);
    await shot(page, '04-fixed-width-grows-with-text');

    await page.evaluate((id) => (window as any).useFlowCanvasStore.getState().updateNodeData(id, { text: 'Short' }), id);
    await page.waitForTimeout(100);
    g = await geometry(page, id);
    expect(g.height).toBeLessThan(ONE_LINE);

    // Dragging the left side moves the left edge and keeps the right edge in place
    const beforeLeft = await geometry(page, id);
    await drag(page, node(page, id).locator('[data-resize="left"]'), -60 * beforeLeft.zoom);
    const afterLeft = await geometry(page, id);
    expect(afterLeft.x).toBeLessThan(beforeLeft.x - 40);
    expect(Math.abs(afterLeft.x + Number(afterLeft.storedWidth) - (beforeLeft.x + Number(beforeLeft.storedWidth)))).toBeLessThan(2);

    // Double-clicking a side goes back to automatic width
    await node(page, id).locator('[data-resize="right"]').dblclick();
    g = await geometry(page, id);
    expect(g.mode).toBe('auto');
    expect(g.storedWidth).toBeUndefined();
  });

  test('dragging a corner scales the font, as one undo step', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Launch week');
    await page.keyboard.press('Escape');
    const history = () => page.evaluate(() => (window as any).useFlowCanvasStore.temporal.getState().pastStates.length);
    const before = await geometry(page, id);
    const steps = await history();

    await drag(page, node(page, id).locator('[data-resize="bottom-right"]'), before.width * before.zoom, 0);
    const after = await geometry(page, id);
    expect(after.fontSize).toBeGreaterThanOrEqual(28);
    expect(after.width).toBeGreaterThan(before.width * 1.6);
    expect(after.x).toBe(before.x); // top-left corner stays anchored
    expect(after.y).toBe(before.y);
    expect(await history()).toBe(steps + 1);
    expect(await page.evaluate(() => (window as any).useFlowCanvasStore.temporal.getState().isTracking)).toBe(true);
    await page.waitForTimeout(100);
    await shot(page, '05-corner-scales-font');

    // The top-left corner anchors the bottom-right one
    await drag(page, node(page, id).locator('[data-resize="top-left"]'), (after.width / 3) * after.zoom, 0);
    const shrunk = await geometry(page, id);
    expect(shrunk.fontSize).toBeLessThan(after.fontSize);
    expect(shrunk.x).toBeGreaterThan(after.x);

    // Clicking away is not an undo step: two ⌘Z undo exactly the two drags
    await pane(page).click({ position: { x: 900, y: 600 } });
    await page.keyboard.press('ControlOrMeta+z');
    expect((await geometry(page, id)).fontSize).toBe(after.fontSize);
    await page.keyboard.press('ControlOrMeta+z');
    expect((await geometry(page, id)).fontSize ?? 16).toBe(16);
  });

  test('a drag cut short by deselecting the text does not leave undo switched off', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Interrupted');
    await page.keyboard.press('Escape');
    const corner = (await node(page, id).locator('[data-resize="bottom-right"]').boundingBox())!;
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
    await page.mouse.down();
    await page.mouse.move(corner.x + 40, corner.y + 10, { steps: 4 });
    // Deselecting unmounts the handles while the button is still down
    await page.evaluate((id) => {
      const s = (window as any).useFlowCanvasStore.getState();
      s.setNodes((nds: any[]) => nds.map((n) => (n.id === id ? { ...n, selected: false } : n)));
    }, id);
    await page.mouse.up();
    expect(await page.evaluate(() => (window as any).useFlowCanvasStore.temporal.getState().isTracking)).toBe(true);
  });

  test('connection points show on hover outside the box and still connect', async ({ page }) => {
    await emptyCanvas(page);
    await page.evaluate(() => {
      (window as any).useFlowCanvasStore.getState().setNodes([
        { id: 'a', type: 'text', position: { x: 100, y: 200 }, data: { text: 'Idea' } },
        { id: 'b', type: 'text', position: { x: 500, y: 200 }, data: { text: 'Follow-up' } },
      ]);
    });
    await page.waitForTimeout(150);
    const rightHandle = node(page, 'a').locator('.react-flow__handle-right');
    await expect(rightHandle).toHaveCSS('opacity', '0');

    const box = (await node(page, 'a').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(rightHandle).toHaveCSS('opacity', '1');
    const h = (await rightHandle.boundingBox())!;
    expect(h.x).toBeGreaterThan(box.x + box.width); // outside the box, clear of the resize edge
    await shot(page, '06-hover-connection-points');

    const target = (await node(page, 'b').locator('.react-flow__handle-left').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => (window as any).useFlowCanvasStore.getState().edges.length)).toBe(1);

    // Dragging the side of a selected text resizes it and never starts a connection
    await node(page, 'b').click();
    await drag(page, node(page, 'b').locator('[data-resize="left"]'), -80);
    expect(await page.evaluate(() => (window as any).useFlowCanvasStore.getState().edges.length)).toBe(1);
    expect((await geometry(page, 'b')).mode).toBe('fixed');
  });

  test('Escape keeps what you typed and leaves the text selected', async ({ page }) => {
    await emptyCanvas(page);
    const id = await writeText(page, { x: 200, y: 300 }, 'Keep me');
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Type something in markdown...')).toHaveCount(0);
    const saved = await page.evaluate(
      (id) => (window as any).useFlowCanvasStore.getState().nodes.find((n: any) => n.id === id),
      id
    );
    expect(saved.data.text).toBe('Keep me');
    expect(saved.selected).toBe(true);
    await page.waitForTimeout(100);
    await shot(page, '07-escape-keeps-text');

    // Enter edits again; Escape keeps the edit
    await page.keyboard.press('Enter');
    await expect(page.getByPlaceholder('Type something in markdown...')).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type(' too');
    await page.keyboard.press('Escape');
    await expect(node(page, id)).toContainText('Keep me too');

    // An empty new text is removed instead of leaving a placeholder behind
    await writeText(page, { x: 200, y: 500 }, '');
    await page.keyboard.press('Escape');
    const texts = await page.evaluate(
      () => (window as any).useFlowCanvasStore.getState().nodes.filter((n: any) => n.type === 'text').length
    );
    expect(texts).toBe(1);
  });

  test('a height stored by an older resize no longer clips the text', async ({ page }) => {
    await emptyCanvas(page);
    await page.evaluate(() => {
      (window as any).useFlowCanvasStore.getState().setNodes([
        {
          id: 'legacy',
          type: 'text',
          position: { x: 100, y: 200 },
          width: 200,
          height: 40,
          data: { text: 'Pricing tiers\n- Free\n- Pro\n- Team' },
        },
      ]);
    });
    await page.waitForTimeout(150);
    const g = await geometry(page, 'legacy');
    expect(g.mode).toBe('fixed');
    expect(g.height).toBeGreaterThan(100);
    expect(g.spillBelow).toBeLessThanOrEqual(1);
  });
});
