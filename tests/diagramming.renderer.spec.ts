import { expect, test, type Page } from '@playwright/test';

/** Diagramming epic (#107): connections, conversions, formatting, mind maps, tidy. */
const pane = (page: Page) => page.locator('.react-flow__pane');
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).useFlowCanvasStore.getState();
  return { nodes: s.nodes, edges: s.edges };
});

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

async function seed(page: Page, nodes: any[], edges: any[] = []) {
  await page.evaluate(
    ([nodes, edges]) => {
      const s = (window as any).useFlowCanvasStore.getState();
      s.setNodes(nodes);
      s.setEdges(edges);
    },
    [nodes, edges] as const
  );
  for (const n of nodes) await node(page, n.id).waitFor();
}

const text = (id: string, x: number, y: number, t: string, extra: Record<string, any> = {}) => ({
  id,
  type: 'text',
  position: { x, y },
  data: { text: t, ...extra },
});

async function selectNode(page: Page, id: string) {
  await page.evaluate((id) => {
    const s = (window as any).useFlowCanvasStore.getState();
    s.setNodes((ns: any[]) => ns.map((n) => ({ ...n, selected: n.id === id })));
    s.setSelectedNodeId?.(id);
  }, id);
}

test.describe('#101 plain connections', () => {
  test('drawing a connection creates a plain line that can become a dependency', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('a', 100, 200, 'Alpha'), text('b', 500, 200, 'Beta')]);

    const from = node(page, 'a').locator('.react-flow__handle-right');
    const to = node(page, 'b').locator('.react-flow__handle-left');
    await node(page, 'a').hover();
    const fb = (await from.boundingBox())!;
    const tb = (await to.boundingBox())!;
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect.poll(async () => (await state(page)).edges.length).toBe(1);
    expect((await state(page)).edges[0].data.relation).toBe('plain');

    // The AI context describes it as a connection, never a dependency.
    const ctx = await page.evaluate(async () => {
      const mod = await import('/src/lib/canvasContext.ts');
      const s = (window as any).useFlowCanvasStore.getState();
      return JSON.stringify(mod.getFlowCanvasContext(s.nodes, s.edges, null, {}));
    });
    expect(ctx).not.toContain('DEPENDS ON');
    expect(ctx).toContain('connected');

    // Switch it to "depends on" from the edge menu.
    await page.locator('[data-edge-relation="plain"] button').first().click({ force: true });
    await page.locator('[data-relation-option="depends"]').click();
    await expect.poll(async () => (await state(page)).edges[0].data.relation).toBe('depends');
  });

  test('legacy edges without a relation still render as dependencies', async ({ page }) => {
    await emptyCanvas(page);
    await seed(
      page,
      [text('a', 100, 200, 'Alpha'), text('b', 500, 200, 'Beta')],
      [{ id: 'e', type: 'semantic', source: 'a', sourceHandle: 'right', target: 'b', targetHandle: 'left', data: {} }]
    );
    await expect(page.locator('[data-edge-relation="depends"]')).toHaveCount(1);
  });
});
