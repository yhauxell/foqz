import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Launch Foqz with a throwaway user-data folder so tests never read or write the real profile
 * (boards, settings, MCP config). `seed` files are written into that folder before launch.
 */
async function launchIsolated(seed: Record<string, unknown> = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foqz-e2e-'));
  for (const [file, content] of Object.entries(seed)) {
    fs.writeFileSync(path.join(userDataDir, file), JSON.stringify(content));
  }
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../electron/main.cjs'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173',
    },
  });
  const cleanup = async () => {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  };
  return { app, userDataDir, cleanup };
}

async function expectIsolatedProfile(app: ElectronApplication, userDataDir: string) {
  const actual = await app.evaluate(({ app }) => app.getPath('userData'));
  expect(fs.realpathSync(actual)).toBe(fs.realpathSync(userDataDir));
}

test.describe('Foqz Electron Native App', () => {
  test('launches the Electron app and loads window', async () => {
    const { app, userDataDir, cleanup } = await launchIsolated();

    try {
      await expectIsolatedProfile(app, userDataDir);

      // Get the main window
      const window = await app.firstWindow();

      // Wait for React to mount
      await window.waitForSelector('body', { timeout: 15000 });

      // Capture native window screenshot
      await window.screenshot({ path: 'test-results/electron-native-window.png' });

      // Validate title
      const title = await window.title();
      expect(title).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  test('external agents can drive the canvas through the Foqz MCP server', async () => {
    const port = 20000 + Math.floor(Math.random() * 20000);
    const token = 'e2e-token-0123456789abcdef';
    const url = `http://127.0.0.1:${port}/mcp`;
    const { app, userDataDir, cleanup } = await launchIsolated({
      'foqz-mcp-host.json': { enabled: true, port, token },
    });

    try {
      await expectIsolatedProfile(app, userDataDir);
      const window = await app.firstWindow();
      await window.waitForSelector('.react-flow', { timeout: 20000 });

      // Requests without the token, or from a browser origin, are refused.
      expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401);
      expect(
        (await fetch(url, { method: 'POST', body: '{}', headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status,
      ).toBe(403);

      const client = new Client({ name: 'foqz-e2e', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      try {
        // The renderer registers its tools once the canvas has mounted.
        await expect
          .poll(async () => (await client.listTools()).tools.map((t) => t.name), { timeout: 15000 })
          .toEqual(expect.arrayContaining(['get_canvas_summary', 'spawn_tasks', 'update_node', 'start_focus_session']));

        const created = await client.callTool({ name: 'foqz_create_task', arguments: { title: 'Task from MCP e2e' } });
        expect(created.isError).toBeFalsy();
        await expect(window.getByText('Task from MCP e2e')).toBeVisible();

        const summary = await client.callTool({ name: 'get_canvas_summary', arguments: {} });
        const text = (summary.content as Array<{ text?: string }>).map((c) => c.text).join('\n');
        expect(text).toMatch(/"Task from MCP e2e".*\[id: [^\]]+\]/);
      } finally {
        await client.close();
      }

      // Settings shows the running server and ready-to-paste client config.
      await window.locator("button[aria-label='Settings']").click();
      await window.getByRole('button', { name: 'Agents & MCP' }).click();
      const section = window.getByText('Connect External Agents to Foqz (MCP Server)');
      await section.scrollIntoViewIfNeeded();
      await expect(window.getByText('Running', { exact: true })).toBeVisible();
      await expect(window.getByText(`claude mcp add --transport http foqz ${url}`, { exact: false })).toBeVisible();
      await window.screenshot({ path: 'test-results/electron-mcp-settings.png' });
    } finally {
      await cleanup();
    }
  });

  test('global quick capture adds an idea from a small panel without opening the board', async () => {
    // Uncommon keys, so a Foqz already running on this machine doesn't hold them.
    const toggle = 'CommandOrControl+Alt+Shift+F9';
    const capture = 'CommandOrControl+Alt+Shift+F10';
    const { app, userDataDir, cleanup } = await launchIsolated({
      'app-settings.json': { globalToggleShortcut: toggle, globalCaptureShortcut: capture, pinWindow: true },
    });

    try {
      await expectIsolatedProfile(app, userDataDir);
      const window = await app.firstWindow();
      await window.waitForSelector('.react-flow', { timeout: 20000 });
      expect(await app.evaluate(({ globalShortcut }, acc) => globalShortcut.isRegistered(acc), capture)).toBe(true);

      // The panel window is created at startup and stays hidden until the shortcut.
      await expect.poll(() => app.windows().some((w) => w.url().includes('capture.html'))).toBe(true);
      const panel = app.windows().find((w) => w.url().includes('capture.html'))!;
      await panel.waitForSelector('[data-testid="capture-panel"]');

      // Playwright can't press OS-level keys: show the panel the way the shortcut does.
      const showPanel = () =>
        app.evaluate(({ BrowserWindow }) => {
          const all = BrowserWindow.getAllWindows();
          all.find((w) => !w.webContents.getURL().includes('capture.html'))!.hide();
          const p = all.find((w) => w.webContents.getURL().includes('capture.html'))!;
          p.webContents.send('capture:shown');
          p.show();
          p.focus();
        });
      const visibility = () =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().map((w) => ({
            capture: w.webContents.getURL().includes('capture.html'),
            visible: w.isVisible(),
            bounds: w.getBounds(),
          })),
        );
      const hasNode = (text: string) =>
        window.evaluate(
          (t) =>
            (window as any).useFlowCanvasStore
              .getState()
              .nodes.some((n: any) => JSON.stringify(n.data).includes(t)),
          text,
        );

      await showPanel();
      const input = panel.getByPlaceholder('Capture an idea to Foqz…');
      await expect(input).toBeFocused();
      await input.fill('[] Idea from anywhere');
      await panel.screenshot({ path: 'test-results/electron-quick-capture-panel.png' });
      const panelBounds = (await visibility()).find((w) => w.capture)!.bounds;
      expect(panelBounds.width).toBeLessThanOrEqual(640);
      expect(panelBounds.height).toBeLessThanOrEqual(140);

      await input.press('Enter');
      await expect.poll(() => hasNode('Idea from anywhere')).toBe(true);
      const after = await visibility();
      expect(after.find((w) => w.capture)!.visible).toBe(false);
      // The board took the idea without being shown.
      expect(after.find((w) => !w.capture)!.visible).toBe(false);

      // Escape closes without adding, and the next open starts empty.
      await showPanel();
      await expect(input).toHaveValue('');
      await input.fill('Never mind');
      await input.press('Escape');
      await expect.poll(async () => (await visibility()).find((w) => w.capture)!.visible).toBe(false);
      expect(await hasNode('Never mind')).toBe(false);

      // Capture shortcut must differ from show / hide; the old value stays registered.
      const res = await window.evaluate(
        (acc) => (window as any).focusStore.setSettings({ globalCaptureShortcut: acc }),
        toggle,
      );
      expect(res.ok).toBe(false);
      expect(res.settings.globalCaptureShortcut).toBe(capture);
      expect(await app.evaluate(({ globalShortcut }, acc) => globalShortcut.isRegistered(acc), capture)).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
