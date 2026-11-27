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

test.describe('#99 text ⇄ sticky ⇄ card shortcuts', () => {
  test('⌥1/⌥2/⌥3 convert the selected node and keep its text', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('t', 300, 250, 'Ship the beta')]);
    await node(page, 't').click();

    await page.keyboard.press('Alt+3');
    await expect.poll(async () => (await state(page)).nodes[0].type).toBe('focusTask');
    expect((await state(page)).nodes[0].data.title).toBe('Ship the beta');

    await page.keyboard.press('Alt+2');
    await expect.poll(async () => (await state(page)).nodes[0].type).toBe('note');

    await page.keyboard.press('Alt+1');
    await expect.poll(async () => (await state(page)).nodes[0].type).toBe('text');
    expect((await state(page)).nodes[0].data.text).toBe('Ship the beta');
  });

  test('⌥3 while typing pulls the selected words into a linked task', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('t', 200, 250, 'Ideas for launch\nBuy the domain\nWrite the post')]);
    await node(page, 't').dblclick();
    const ta = page.locator('#text-node-input-t');
    await expect(ta).toBeFocused();
    await page.waitForTimeout(100); // the editor puts the caret at the end on open
    await ta.evaluate((el: HTMLTextAreaElement) => {
      const s = el.value.indexOf('Buy the domain');
      el.setSelectionRange(s, s + 'Buy the domain'.length);
    });
    await page.keyboard.press('Alt+3');

    await expect.poll(async () => (await state(page)).nodes.length).toBe(2);
    const { nodes, edges } = await state(page);
    const task = nodes.find((n: any) => n.type === 'focusTask');
    expect(task.data.title).toBe('Buy the domain');
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ source: 't', target: task.id, data: { relation: 'relates' } });
    await expect(ta).toHaveValue('Ideas for launch\nWrite the post');
  });
});

test.describe('#100 formatting after typing', () => {
  test('a selected text can be formatted from the toolbar and with ⌘I', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('t', 300, 250, 'Important')]);
    await node(page, 't').click();
    await page.getByRole('button', { name: 'Bold all (⌘B)' }).click();
    await expect.poll(async () => (await state(page)).nodes[0].data.text).toBe('**Important**');

    await page.keyboard.press('ControlOrMeta+i');
    await expect.poll(async () => (await state(page)).nodes[0].data.text).toBe('***Important***');
  });

  test('sticky notes get the formatting bar and shortcuts while editing', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [
      { id: 's', type: 'note', position: { x: 300, y: 200 }, style: { width: 240, height: 180 }, data: { title: 'Note', text: 'hello world' } },
    ]);
    await node(page, 's').click();
    await node(page, 's').locator('.flex-1').last().dblclick();
    const ta = page.locator('#text-node-input-s');
    await expect(ta).toBeFocused();
    await page.waitForTimeout(100);
    await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();

    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 5));
    await page.keyboard.press('ControlOrMeta+b');
    await expect(ta).toHaveValue('**hello** world');

    await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(10, 15));
    await page.getByRole('button', { name: 'Italic (*text*)' }).click();
    await expect(ta).toHaveValue('**hello** *world*');
  });
});

const mapOf = (nodes: any[]) =>
  Object.fromEntries(nodes.filter((n) => n.data?.mindmap).map((n) => [String(n.data.text), n]));
const box = async (page: Page, id: string) => (await node(page, id).boundingBox())!;
/** A new branch's editor takes focus within a frame or two of being created. */
const editorReady = (page: Page) => expect(page.locator('.react-flow__node textarea:focus')).toHaveCount(1);

test.describe('#102/#103 mind maps', () => {
  test('keyboard-only: M, Tab, Enter, Tab builds a laid-out map', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('root', 300, 300, 'Launch')]);
    await node(page, 'root').click();
    await page.keyboard.press('m');
    await expect.poll(async () => (await state(page)).nodes[0].data.mindmap?.rootId).toBe('root');

    await page.keyboard.press('Tab');
    await editorReady(page);
    await page.keyboard.type('Marketing');
    await page.keyboard.press('Enter');
    await editorReady(page);
    await page.keyboard.type('Build');
    await page.keyboard.press('Tab');
    await editorReady(page);
    await page.keyboard.type('API');
    await page.keyboard.press('Escape');

    await expect.poll(async () => Object.keys(mapOf((await state(page)).nodes)).sort()).toEqual(['API', 'Build', 'Launch', 'Marketing']);
    const { nodes, edges } = await state(page);
    const m = mapOf(nodes);
    expect(m.Marketing.data.mindmap.parentId).toBe('root');
    expect(m.Build.data.mindmap.parentId).toBe('root');
    expect(m.API.data.mindmap.parentId).toBe(m.Build.id);
    expect(edges.filter((e: any) => e.data?.mindmap)).toHaveLength(3);
    expect(edges.every((e: any) => e.data.relation === 'plain')).toBe(true);

    // Laid out: branches fan out from the root (one each side) and the grandchild sits beyond its parent.
    await page.waitForTimeout(200);
    const r = await box(page, 'root');
    const mk = await box(page, m.Marketing.id);
    const b = await box(page, m.Build.id);
    const a = await box(page, m.API.id);
    expect(mk.x > r.x + r.width || mk.x + mk.width < r.x).toBe(true);
    expect(b.x > r.x + r.width || b.x + b.width < r.x).toBe(true);
    const outward = b.x > r.x ? a.x > b.x + b.width : a.x + a.width < b.x;
    expect(outward).toBe(true);
  });

  test('fold, navigate, outdent and drop to re-parent', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('root', 300, 300, 'Launch\n- Marketing\n  - Post\n  - Video\n- Build')]);
    await node(page, 'root').click();
    await page.keyboard.press('m');
    await expect.poll(async () => Object.keys(mapOf((await state(page)).nodes)).length).toBe(5);
    let m = mapOf((await state(page)).nodes);
    expect(m.Post.data.mindmap.parentId).toBe(m.Marketing.id);

    // Arrow from the root into its first right-hand branch.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await state(page)).nodes.filter((n: any) => n.selected).map((n: any) => n.data.text)).toEqual(['Marketing']);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await state(page)).nodes.find((n: any) => n.selected)?.data.text).toBe('Post');

    // Fold Marketing: its two children hide and a +2 badge appears.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('/');
    await expect(node(page, m.Marketing.id).getByRole('button', { name: 'Show 2 hidden' })).toBeVisible();
    await expect(node(page, m.Post.id)).toBeHidden();
    await node(page, m.Marketing.id).getByRole('button', { name: 'Show 2 hidden' }).click();
    await expect(node(page, m.Post.id)).toBeVisible();

    // Shift+Tab on Video moves it up next to Marketing.
    await node(page, m.Video.id).click();
    await page.keyboard.press('Shift+Tab');
    await expect.poll(async () => mapOf((await state(page)).nodes).Video.data.mindmap.parentId).toBe('root');

    // Drag Post onto Build: the branch moves under Build. (Clear the selection so its toolbar is out of the way.)
    await pane(page).click({ position: { x: 640, y: 700 } });
    await page.waitForTimeout(200);
    const from = await box(page, m.Post.id);
    const to = await box(page, m.Build.id);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect.poll(async () => mapOf((await state(page)).nodes).Post.data.mindmap.parentId).toBe(m.Build.id);
  });

  test('Backspace on an empty branch removes it and selects the parent', async ({ page }) => {
    await emptyCanvas(page);
    await seed(page, [text('root', 300, 300, 'Topic', { mindmap: { rootId: 'root', parentId: null, order: 0 } })]);
    await node(page, 'root').click();
    await page.keyboard.press('Tab');
    await expect.poll(async () => (await state(page)).nodes.length).toBe(2);
    await editorReady(page);
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await state(page)).nodes.length).toBe(1);
    expect((await state(page)).nodes[0].selected).toBe(true);
    expect((await state(page)).edges).toHaveLength(0);
  });
});
