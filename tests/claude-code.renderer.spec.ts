import { expect, test, type Page } from '@playwright/test';

/**
 * Local Claude Code as the canvas AI (#80). The Electron bridge is stubbed: it replays
 * stream-json lines the way electron/claudeCode.cjs forwards them from `claude -p`.
 */
const pane = (page: Page) => page.locator('.react-flow__pane');

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'foqz_app_settings',
      JSON.stringify({ activeAiProvider: 'claude-code', claudeCodeEnabled: true }),
    );
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
    (window as any).focusStore = {
      claudeCode: {
        detect: async () => ({ ok: true, path: '/bin/claude', version: '9.9.9 (Claude Code)', canvasTools: true }),
        cancel: async () => true,
        onLine: (h: any) => (lineHandlers.add(h), () => lineHandlers.delete(h)),
        onExit: (h: any) => (exitHandlers.add(h), () => exitHandlers.delete(h)),
        run: async (req: any) => {
          runs.push(req);
          setTimeout(() => {
            emit(req.requestId, delta('Marking it done.'));
            emit(req.requestId, {
              type: 'assistant',
              parent_tool_use_id: null,
              message: {
                content: [{ type: 'tool_use', id: 't1', name: 'mcp__foqz__update_node', input: { id: 'x', status: 'done' } }],
              },
            });
            emit(req.requestId, {
              type: 'user',
              parent_tool_use_id: null,
              message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Updated.' }] },
            });
            emit(req.requestId, delta('All set.'));
            emit(req.requestId, { type: 'result', is_error: false, result: 'All set.' });
            exitHandlers.forEach((h) => h({ requestId: req.requestId, code: 0, signal: null, stderr: '' }));
          }, 50);
          return { ok: true };
        },
      },
    };
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

test('the canvas chat runs the local Claude Code and shows its answer and tool calls', async ({ page }) => {
  await setup(page);
  await page.locator("button[title^='Text (T)']").click();
  await pane(page).click({ position: { x: 400, y: 300 } });
  await page.getByPlaceholder('Type something in markdown...').fill('Write the release notes');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Ask AI about this' }).click();
  const input = page.getByPlaceholder(/Ask about/);
  await expect(page.getByText('Claude Code: default')).toBeVisible();
  await input.fill('mark this done');
  await input.press('Enter');

  await expect(page.getByText('Marking it done.')).toBeVisible();
  await expect(page.getByText('All set.')).toBeVisible();

  const run = await page.evaluate(() => (window as any).__claudeRuns[0]);
  expect(run.prompt).toContain('User request: mark this done');
  expect(run.systemPrompt).toContain('mcp__foqz__');
  expect(run.systemPrompt).toContain('Write the release notes');
});
