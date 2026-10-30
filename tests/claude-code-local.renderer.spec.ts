import { expect, test, type Page } from '@playwright/test';

/**
 * Local Claude Code runs in a folder (#88): folder access, the GitHub-content confirmation,
 * Run task with its run log and summary, and session resume. The Electron bridge is stubbed the
 * way electron/claudeCode.cjs behaves: `resolve` reads folder access from Settings and `run`
 * replays stream-json lines.
 */

type Opts = { profile: 'canvas' | 'read' | 'workspace'; github?: boolean };

async function setup(page: Page, opts: Opts) {
  const board = {
    nodes: [
      {
        id: 'proj',
        type: 'projectFrame',
        position: { x: 60, y: 80 },
        style: { width: 560, height: 360 },
        data: { title: 'Login', goal: 'Ship SSO', accent: 'blue', borderStyle: 'solid', connectors: { localFolder: '/repo' } },
      },
      {
        id: 'task',
        type: 'focusTask',
        parentId: 'proj',
        position: { x: 40, y: 80 },
        style: { width: 300, height: 170 },
        data: {
          title: 'Fix the login redirect',
          notes: '- [ ] reproduce',
          status: 'open',
          ...(opts.github ? { githubRepo: 'acme/web', githubIssueNumber: 42 } : {}),
        },
      },
    ],
    edges: [],
    annotations: {},
  };
  await page.addInitScript(
    ({ snapshot, profile }) => {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        localStorage.setItem('foqz_reactflow_poc_board_v1', JSON.stringify(snapshot));
        localStorage.setItem(
          'foqz_app_settings',
          JSON.stringify({
            activeAiProvider: 'claude-code',
            claudeCodeEnabled: true,
            claudeCodeFolders: profile === 'canvas' ? [] : [{ path: '/repo', profile, bashAllowlist: ['npm test'] }],
          }),
        );
      }
      const lineHandlers = new Set<(p: any) => void>();
      const exitHandlers = new Set<(p: any) => void>();
      const runs: any[] = [];
      (window as any).__claudeRuns = runs;
      const emit = (requestId: string, obj: unknown) =>
        lineHandlers.forEach((h) => h({ requestId, line: JSON.stringify(obj) }));
      const delta = (text: string) => ({
        type: 'stream_event',
        parent_tool_use_id: null,
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
      });
      const access = (folder: string) => {
        if (!folder) return { ok: true, cwd: '/foqz', isDefault: true, profile: 'canvas', bashAllowlist: [] };
        const settings = JSON.parse(localStorage.getItem('foqz_app_settings') || '{}');
        const match = (settings.claudeCodeFolders || []).find((f: any) => f.path === folder);
        return { ok: true, cwd: folder, isDefault: false, profile: match?.profile || 'canvas', bashAllowlist: match?.bashAllowlist || [] };
      };
      (window as any).focusStore = {
        claudeCode: {
          detect: async () => ({ ok: true, path: '/bin/claude', version: '9.9.9 (Claude Code)', canvasTools: true }),
          resolve: async (req: any) => access(req?.folder || ''),
          pickFolder: async () => '/picked',
          findClone: async () => null,
          cancel: async () => true,
          onLine: (h: any) => (lineHandlers.add(h), () => lineHandlers.delete(h)),
          onExit: (h: any) => (exitHandlers.add(h), () => exitHandlers.delete(h)),
          run: async (req: any) => {
            runs.push(req);
            const a = access(req.folder || '');
            const persistent = a.profile !== 'canvas';
            setTimeout(() => {
              emit(req.requestId, { type: 'system', subtype: 'init', session_id: req.sessionId || 'ephemeral', tools: [] });
              emit(req.requestId, {
                type: 'assistant',
                parent_tool_use_id: null,
                message: { content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/repo/src/login.ts' } }] },
              });
              emit(req.requestId, {
                type: 'user',
                parent_tool_use_id: null,
                message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Edited.' }] },
              });
              emit(req.requestId, delta(`Run ${runs.length}. Fixed the redirect.\n\nSummary: Patched the login redirect.`));
              emit(req.requestId, {
                type: 'result',
                is_error: false,
                result: 'done',
                total_cost_usd: 0.0123,
                duration_ms: 2100,
                session_id: req.sessionId,
              });
              exitHandlers.forEach((h) => h({ requestId: req.requestId, code: 0, signal: null, stderr: '' }));
            }, 50);
            return { ok: true, profile: a.profile, cwd: a.cwd, persistent };
          },
        },
      };
    },
    { snapshot: board, profile: opts.profile },
  );
  await page.goto('/');
  await page.locator('.react-flow__node[data-id="task"]').waitFor();
}

async function openTaskChat(page: Page) {
  await page.locator('.react-flow__node[data-id="task"]').click({ position: { x: 150, y: 20 } });
  await page.getByRole('button', { name: 'Ask AI about this', exact: true }).click();
  await expect(page.locator('[data-claude-code-bar]')).toBeVisible();
}

const taskData = (page: Page) =>
  page.evaluate(() => (window as any).useFlowCanvasStore.getState().nodes.find((n: any) => n.id === 'task').data);

test('Run task works in the region folder, logs the run and writes the summary back', async ({ page }) => {
  await setup(page, { profile: 'workspace' });
  await openTaskChat(page);

  const bar = page.locator('[data-claude-code-bar]');
  await expect(bar.getByTestId('claude-code-folder')).toHaveText('repo');
  await expect(bar.getByLabel('Claude Code access for this folder')).toHaveValue('workspace');

  await bar.getByRole('button', { name: 'Run task' }).click();
  await expect(page.getByText('Run 1. Fixed the redirect.')).toBeVisible();

  const run = await page.evaluate(() => (window as any).__claudeRuns[0]);
  expect(run.folder).toBe('/repo');
  expect(run.nodeId).toBe('task');
  expect(run.resume).toBe(false);
  expect(run.prompt).toContain('Work on this task in the working folder: Fix the login redirect');
  expect(run.prompt).toContain('- [ ] reproduce');
  expect(run.systemPrompt).toContain('You are working in the folder /repo');

  // The run log: summary line, then the full log on demand.
  const log = page.locator('[data-claude-code-run-log]');
  await expect(log).toContainText('2.1 s');
  await expect(log).toContainText('$0.012');
  await expect(log).toContainText('1 file changed');
  await log.getByRole('button', { name: /Run log/ }).click();
  await expect(log.getByRole('log')).toContainText('▸ Edit');
  await expect(log.getByRole('log')).toContainText('Changed: src/login.ts');

  // The summary is on the task; its status is the user's call.
  const data = await taskData(page);
  expect(data.notes).toContain('**Claude Code run (');
  expect(data.notes).toContain('Patched the login redirect.');
  expect(data.notes).toContain('`src/login.ts`');
  expect(data.status).toBe('open');
  expect(data.claudeCodeSession).toEqual({ id: run.sessionId, cwd: '/repo' });

  await log.getByRole('button', { name: 'Mark task done' }).click();
  expect((await taskData(page)).status).toBe('done');
});

test('follow-ups resume the session, and New session starts over', async ({ page }) => {
  await setup(page, { profile: 'read' });
  await openTaskChat(page);
  const input = page.getByPlaceholder(/Ask about/);

  await input.fill('look at the redirect');
  await input.press('Enter');
  await expect(page.getByText('Run 1.')).toBeVisible();
  await input.fill('and the tests?');
  await input.press('Enter');
  await expect(page.getByText('Run 2.')).toBeVisible();

  const [first, second] = await page.evaluate(() => (window as any).__claudeRuns);
  expect(first.resume).toBe(false);
  expect(second.resume).toBe(true);
  expect(second.sessionId).toBe(first.sessionId);
  expect(second.prompt).not.toContain('look at the redirect');

  // The session survives a reload: it is stored on the item.
  await page.reload();
  await page.locator('.react-flow__node[data-id="task"]').waitFor();
  await openTaskChat(page);
  await page.getByPlaceholder(/Ask about/).fill('one more');
  await page.getByPlaceholder(/Ask about/).press('Enter');
  await expect(page.getByText('Run 1.')).toHaveCount(2);
  const afterReload = await page.evaluate(() => (window as any).__claudeRuns[0]);
  expect(afterReload).toMatchObject({ sessionId: first.sessionId, resume: true });

  await page.locator('[data-claude-code-bar]').getByRole('button', { name: 'New session' }).click();
  await page.getByPlaceholder(/Ask about/).fill('fresh start');
  await page.getByPlaceholder(/Ask about/).press('Enter');
  await expect(page.getByText('Run 2.')).toHaveCount(2);
  const fresh = await page.evaluate(() => (window as any).__claudeRuns[1]);
  expect(fresh.resume).toBe(false);
  expect(fresh.sessionId).not.toBe(first.sessionId);
});

test('a run that can touch files waits for a yes when GitHub-imported text is on the board', async ({ page }) => {
  await setup(page, { profile: 'workspace', github: true });
  await openTaskChat(page);

  await page.locator('[data-claude-code-bar]').getByRole('button', { name: 'Run task' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Confirm Claude Code run' });
  await expect(dialog).toContainText('edit files and run allowed commands');
  await expect(dialog).toContainText('acme/web#42');
  expect(await page.evaluate(() => (window as any).__claudeRuns.length)).toBe(0);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => (window as any).__claudeRuns.length)).toBe(0);

  await page.locator('[data-claude-code-bar]').getByRole('button', { name: 'Run task' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Run anyway' }).click();
  await expect(page.getByText('Run 1.')).toBeVisible();

  // Confirmed once for this folder, access and content: no second prompt.
  await page.getByPlaceholder(/Ask about/).fill('again');
  await page.getByPlaceholder(/Ask about/).press('Enter');
  await expect(page.getByText('Run 2.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('canvas-only folders never ask and keep no session', async ({ page }) => {
  await setup(page, { profile: 'canvas', github: true });
  await openTaskChat(page);
  await expect(page.locator('[data-claude-code-bar]').getByLabel('Claude Code access for this folder')).toHaveValue('canvas');
  await page.getByPlaceholder(/Ask about/).fill('hi');
  await page.getByPlaceholder(/Ask about/).press('Enter');
  await expect(page.getByText('Run 1.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const run = await page.evaluate(() => (window as any).__claudeRuns[0]);
  expect(run.sessionId).toBeUndefined();
  expect(run.systemPrompt).toContain('no access to files');
  expect((await taskData(page)).claudeCodeSession).toBeUndefined();
});

test('the chat bar sets a folder for the item and changes the folder access', async ({ page }) => {
  await setup(page, { profile: 'canvas' });
  await openTaskChat(page);
  const bar = page.locator('[data-claude-code-bar]');
  await bar.getByTestId('claude-code-folder').click();
  await expect(bar.getByTestId('claude-code-folder')).toHaveText('picked');
  expect((await taskData(page)).localFolder).toBe('/picked');

  await bar.getByLabel('Claude Code access for this folder').selectOption('read');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('foqz_app_settings') || '{}').claudeCodeFolders))
    .toEqual([{ path: '/picked', profile: 'read', bashAllowlist: [] }]);

  // Clearing the item's own folder falls back to the region's.
  await bar.getByTitle("Stop using this item's own folder").click();
  await expect(bar.getByTestId('claude-code-folder')).toHaveText('repo');
});

test('a region links a local folder and grants it access from its connectors', async ({ page }) => {
  await setup(page, { profile: 'canvas' });
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('foqz:open-project-connectors', { detail: { shapeId: 'proj' } })),
  );
  const field = page.locator('[data-claude-code-folder]');
  await expect(field.getByLabel('Local folder')).toHaveValue('/repo');
  await expect(field.getByRole('radio', { name: 'Canvas only' })).toHaveAttribute('aria-checked', 'true');

  await field.getByRole('button', { name: 'Browse' }).click();
  await expect(field.getByLabel('Local folder')).toHaveValue('/picked');
  await field.getByRole('radio', { name: 'Workspace' }).click();
  await expect(field).toContainText('edit files here and run the shell commands');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const region = await page.evaluate(
    () => (window as any).useFlowCanvasStore.getState().nodes.find((n: any) => n.id === 'proj').data,
  );
  expect(region.connectors.localFolder).toBe('/picked');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('foqz_app_settings') || '{}').claudeCodeFolders))
    .toEqual([{ path: '/picked', profile: 'workspace', bashAllowlist: [] }]);
});
