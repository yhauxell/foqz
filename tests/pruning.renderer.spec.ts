import { test, expect, type Page } from '@playwright/test';

/**
 * Canvas pruning (docs/specs/canvas-pruning.md): one text concept with styles and a to-do
 * behavior, focus in place, regions that never eat their contents, a v1 → v2 board migration,
 * and the slimmer command bar and settings. Screenshots are saved as evidence for the spec.
 */

const SHOTS = 'docs/specs/pruning/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

const pane = (page: Page) => page.locator('.react-flow__pane');
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const store = <T,>(page: Page, fn: string) =>
  page.evaluate((src) => new Function('s', `return (${src})(s)`)((window as any).useFlowCanvasStore.getState()), fn) as Promise<T>;

/** A board saved by v0.13: runway with staged tasks, priority, doing, todo/constraint, blocks/aggregates. */
const LEGACY_BOARD = {
  nodes: [
    {
      id: 'proj-launch',
      type: 'projectFrame',
      position: { x: 60, y: 60 },
      style: { width: 620, height: 520 },
      data: {
        title: 'Launch week',
        goal: 'Ship the public beta',
        accent: 'emerald',
        borderStyle: 'solid',
        connectors: { githubRepo: 'acme/launch', githubToken: 'ghp_legacy', notionWorkspace: 'Roadmap' },
        customAgent: '# Planner',
      },
    },
    {
      id: 'task-copy',
      type: 'focusTask',
      parentId: 'proj-launch',
      position: { x: 40, y: 90 },
      style: { width: 280, height: 82 },
      data: { title: 'Write launch post', status: 'doing', priority: 1, paper: 'cream' },
    },
    {
      id: 'runway-today',
      type: 'runwayFrame',
      position: { x: 760, y: 60 },
      style: { width: 560, height: 420 },
      data: { title: "🎯 Today's Runway", templateId: 'rule_of_3', capacitySlots: 3 },
    },
    {
      id: 'task-demo',
      type: 'focusTask',
      parentId: 'runway-today',
      position: { x: 24, y: 82 },
      style: { width: 512, height: 50 },
      data: {
        title: 'Record the demo video',
        status: 'open',
        priority: 2,
        paper: 'sage',
        originProjectId: 'proj-launch',
        originProjectTitle: 'Launch week',
        originProjectPos: { x: 40, y: 300 },
        stagedAt: 1,
        stowedEdges: [
          { id: 'e-stowed', type: 'semantic', source: 'task-demo', target: 'task-copy', data: { relation: 'blocks' } },
        ],
      },
    },
    {
      id: 'task-loose',
      type: 'focusTask',
      parentId: 'runway-today',
      position: { x: 24, y: 142 },
      style: { width: 512, height: 50 },
      data: { title: 'Email the press list', status: 'open', priority: 3, paper: 'fog' },
    },
    {
      id: 'note-idea',
      type: 'note',
      position: { x: 760, y: 560 },
      style: { width: 240, height: 170 },
      data: { title: 'Note', text: 'Ask Sam for a quote', variant: 'yellow' },
    },
  ],
  edges: [
    { id: 'e-agg', type: 'semantic', source: 'task-copy', target: 'note-idea', data: { relation: 'aggregates' } },
  ],
  annotations: {
    'ann-todo': {
      id: 'ann-todo',
      anchor: { nodeId: 'task-copy', rel: { x: 0.9, y: 0.1 } },
      kind: 'todo',
      status: 'open',
      aiVisible: true,
      createdAt: 1,
      updatedAt: 1,
      messages: [{ id: 'm1', author: 'user', body: 'Needs a hero image', createdAt: 1 }],
    },
  },
  updatedAt: 1,
};

async function seedBoard(page: Page, board: unknown) {
  await page.addInitScript((snapshot) => {
    if (sessionStorage.getItem('__pruningSeeded')) return;
    sessionStorage.setItem('__pruningSeeded', '1');
    localStorage.clear();
    localStorage.setItem('foqz_reactflow_poc_board_v1', JSON.stringify(snapshot));
  }, board);
}

test.describe('Canvas pruning', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('1. a v0.13 board migrates: runway dissolved, tasks home, kinds and relations collapsed', async ({ page }) => {
    await seedBoard(page, LEGACY_BOARD);
    await page.goto('/');
    await expect(node(page, 'task-copy')).toBeVisible();

    // Runway is gone; its staged task went back to its region at the remembered spot.
    await expect(page.locator('.react-flow__node-runwayFrame')).toHaveCount(0);
    const migrated = await store<any>(page, `(s) => ({
      demo: s.nodes.find((n) => n.id === 'task-demo'),
      loose: s.nodes.find((n) => n.id === 'task-loose'),
      copy: s.nodes.find((n) => n.id === 'task-copy'),
      region: s.nodes.find((n) => n.id === 'proj-launch'),
      edges: s.edges.map((e) => [e.id, e.data && e.data.relation]),
      kind: s.annotations['ann-todo'].kind,
    })`);
    expect(migrated.demo.parentId).toBe('proj-launch');
    expect(migrated.demo.position).toEqual({ x: 40, y: 300 });
    expect(migrated.loose.parentId).toBeUndefined();
    expect(migrated.copy.data.status).toBe('open');
    expect(migrated.copy.data).not.toHaveProperty('priority');
    expect(migrated.region.data.connectors).toEqual({ githubRepo: 'acme/launch' });
    expect(migrated.edges).toEqual(expect.arrayContaining([['e-agg', 'relates'], ['e-stowed', 'depends']]));
    expect(migrated.kind).toBe('comment');

    // The raw v1 JSON is kept as a backup, and the stripped token became the global one.
    const backup = await page.evaluate(() => localStorage.getItem('foqz_board_backup_v1:board-default'));
    expect(backup).toContain('runway-today');
    expect(await page.evaluate(() => localStorage.getItem('foqz_github_token'))).toBe('ghp_legacy');

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('foqz:fit-view')));
    await page.waitForTimeout(500);
    await shot(page, '01-migrated-legacy-board');
  });

  test('2. any plain text becomes a to-do with ⌘↵ and can be checked off', async ({ page }) => {
    await page.goto('/');
    await page.locator("button[title^='Text (T)']").click();
    await pane(page).click({ position: { x: 980, y: 480 } });
    const textarea = page.getByPlaceholder('Type something in markdown...');
    await textarea.fill('Draft the pricing page');
    // While typing, the toolbar shows only formatting
    await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, '02-toolbar-while-typing');
    await pane(page).click({ position: { x: 700, y: 40 } });

    const text = page.locator('.react-flow__node-text').filter({ hasText: 'Draft the pricing page' });
    await text.click();
    await expect(page.getByRole('button', { name: /^Style:/ })).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, '02a-plain-text-selected');

    await expect(page.getByRole('toolbar', { name: 'Element actions' })).toBeVisible();
    await page.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: /Duplicate/ })).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, '02-toolbar-more-menu');
    await page.keyboard.press('Escape');
    await text.click();

    await page.keyboard.press('ControlOrMeta+Enter');
    const checkbox = text.getByRole('checkbox');
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('button', { name: /^To-do/ })).toHaveAttribute('aria-pressed', 'true');
    await shot(page, '02b-plain-text-is-a-todo');

    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await expect(text.locator('.line-through')).toBeVisible();
    await pane(page).click({ position: { x: 700, y: 40 } });
    await shot(page, '02c-todo-done');
  });

  test('3. one text, three styles: plain → sticky → card keeps content and edges', async ({ page }) => {
    await page.goto('/');
    // Wire the demo text to a card so we can check the edge survives restyling.
    await page.evaluate(() => {
      const s = (window as any).useFlowCanvasStore.getState();
      s.setEdges((eds: any[]) => [
        ...eds,
        { id: 'e-style', type: 'semantic', source: 'text-demo', target: 'task-2', data: { relation: 'relates' } },
      ]);
      s.updateNodeData('text-demo', { text: 'Pricing tiers\n- [ ] Free\n- [ ] Pro' });
    });

    const styleButton = page.getByRole('button', { name: /^Style:/ });
    const styles = page.getByRole('radiogroup', { name: 'Text style' });
    // The demo pencil stroke sits under the text; click its top-left corner.
    await node(page, 'text-demo').click({ position: { x: 16, y: 10 } });
    await expect(styleButton).toHaveAccessibleName('Style: Plain');
    await shot(page, '03a-style-plain');

    // Style is a small dropdown in the toolbar
    await styleButton.click();
    await expect(styles).toBeVisible();
    await page.waitForTimeout(200);
    await shot(page, '03a2-style-menu-open');
    await styles.getByRole('radio', { name: /Sticky/ }).click();
    await expect(node(page, 'text-demo')).toHaveClass(/react-flow__node-note/);
    await expect(node(page, 'text-demo')).toContainText('Pricing tiers');
    await expect(styleButton).toHaveAccessibleName('Style: Sticky');
    await page.waitForTimeout(300);
    await shot(page, '03b-style-sticky');

    await styleButton.click();
    await styles.getByRole('radio', { name: /Card/ }).click();
    await expect(node(page, 'text-demo')).toHaveClass(/react-flow__node-focusTask/);
    await expect(node(page, 'text-demo')).toContainText('Pricing tiers');
    await page.waitForTimeout(300);
    await shot(page, '03c-style-card');

    const after = await store<any>(page, `(s) => ({
      edge: s.edges.some((e) => e.id === 'e-style'),
      data: s.nodes.find((n) => n.id === 'text-demo').data,
    })`);
    expect(after.edge).toBe(true);
    expect(after.data.title).toBe('Pricing tiers');
    expect(after.data.notes).toContain('- [ ] Pro');
    expect(after.data.actionable).toBe(true);
    // The plain text color must not become the sticky/card background.
    expect(after.data).not.toHaveProperty('color');
  });

  test('4. focus happens in place with a floating timer, no full-screen overlay', async ({ page }) => {
    await page.goto('/');
    await node(page, 'task-2').click();
    await page.keyboard.press('f');

    const pill = page.getByTestId('focus-pill');
    await expect(pill).toBeVisible();
    await expect(pill).toContainText('Connect task cards to sketch boxes');
    await expect(page.getByTestId('focus-timer')).toHaveText(/^25:00|24:5\d$/);
    await expect(page.getByText('Remaining Time')).toHaveCount(0);
    await page.waitForTimeout(700); // let the camera settle
    await shot(page, '04-focus-in-place');

    await pill.getByRole('button', { name: 'Leave focus' }).click();
    await expect(pill).toBeHidden();
  });

  test('5. a region adopts what you drop in it and keeps its contents when deleted', async ({ page }) => {
    await page.goto('/');
    await expect(node(page, 'proj-1')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('foqz:fit-view')));
    await page.waitForTimeout(400);
    await shot(page, '05a-region-with-children');

    await node(page, 'proj-1').click({ position: { x: 300, y: 20 } });
    await page.keyboard.press('Backspace');

    await expect(node(page, 'proj-1')).toHaveCount(0);
    await expect(node(page, 'task-1')).toBeVisible();
    await expect(node(page, 'task-2')).toBeVisible();
    await expect(node(page, 'box-demo')).toBeVisible();
    const released = await store<any>(page, `(s) => s.nodes.filter((n) => ['task-1', 'task-2', 'box-demo'].includes(n.id)).map((n) => n.parentId || null)`);
    expect(released).toEqual([null, null, null]);
    await shot(page, '05b-region-deleted-children-kept');
  });

  test('6. settings has three tabs and two AI providers', async ({ page }) => {
    await page.goto('/');
    await page.locator("button[aria-label='Settings']").click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('tab')).toHaveText(['App', 'Intelligence', 'Integrations']);
    await page.waitForTimeout(300);
    await shot(page, '06a-settings-app');

    await dialog.getByRole('tab', { name: 'Intelligence' }).click();
    await expect(dialog.getByText('OpenAI-compatible', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Google Gemini' })).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '06b-settings-intelligence');

    await dialog.getByRole('tab', { name: 'Integrations' }).click();
    await expect(dialog.getByText('GitHub', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, '06c-settings-integrations');
  });

  test('7. the command bar captures, finds and lists shortcuts', async ({ page }) => {
    await page.goto('/');
    await page.locator("button[title='Find, run, or write (⌘K)']").click();
    const input = page.getByPlaceholder(/just type to write/);
    await page.waitForTimeout(300);
    await shot(page, '07a-command-bar-empty');

    await input.fill('[] Confirm the venue');
    await expect(page.getByText('Write to-do: "Confirm the venue"')).toBeVisible();
    await shot(page, '07b-command-bar-capture-todo');
    await input.press('Enter');
    await expect(page.locator('.react-flow__node-text').filter({ hasText: 'Confirm the venue' }).getByRole('checkbox')).toBeVisible();

    await page.locator("button[title='Find, run, or write (⌘K)']").click();
    await page.getByPlaceholder(/just type to write/).fill('?');
    await expect(page.getByTestId('command-bar').getByText('Make it a to-do')).toBeVisible();
    await page.waitForTimeout(300); // let the open animation finish
    await shot(page, '07c-command-bar-shortcuts');
  });

  test('8. the toolbar has one Text tool and no task, runway or note tools', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator("button[title^='Text (T)']")).toBeVisible();
    await expect(page.locator("button[title*='Task Card Tool']")).toHaveCount(0);
    await expect(page.locator("button[title*='Sticky Note Tool']")).toHaveCount(0);
    await expect(page.locator("button[title*='Runway']")).toHaveCount(0);
    await expect(page.locator("button[aria-label='Quick Task Capture']")).toHaveCount(0);
    await shot(page, '08-toolbar-and-topbar');
  });
});
