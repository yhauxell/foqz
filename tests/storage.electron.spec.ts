import { _electron as electron, test, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boards as files on disk: saved on quit, loaded when the browser cache is gone, kept when they
 * can't be read, and restorable from backups. Every launch uses a throwaway user-data folder, never
 * the real profile. Needs the Vite dev server on port 5173 (`npx vite --port 5173`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function launch(userDataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../electron/main.cjs'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
  });
  const actual = await app.evaluate(({ app }) => app.getPath('userData'));
  expect(fs.realpathSync(actual)).toBe(fs.realpathSync(userDataDir));
  const page = await app.firstWindow();
  await page.waitForSelector('.react-flow', { timeout: 20000 });
  return { app, page };
}

/** Quit the way the user does (Cmd+Q runs before-quit), and return how long it took. */
async function quit(app: ElectronApplication): Promise<number> {
  const started = Date.now();
  const closed = new Promise((resolve) => app.process().once('exit', resolve));
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await closed;
  return Date.now() - started;
}

function textNode(id: string, text: string, x = 120) {
  return { id, type: 'text', position: { x, y: 120 }, data: { text } };
}

function boardJson(nodes: unknown[], updatedAt = Date.now()) {
  return JSON.stringify({ version: 2, revision: 1, nodes, edges: [], annotations: {}, updatedAt });
}

let userDataDir: string;
const boardsDir = () => path.join(userDataDir, 'boards');

test.beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foqz-storage-e2e-'));
});
test.afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

test('an edit made right before quitting is on disk, and boards load from disk without the cache', async () => {
  let { app, page } = await launch(userDataDir);
  await page.evaluate((node) => {
    const s = (window as any).useFlowCanvasStore.getState();
    s.setNodes([...s.nodes, node]);
  }, textNode('quit-note', 'Written just before quitting'));
  // Quit at once, inside the 600 ms autosave debounce.
  const took = await quit(app);
  expect(took).toBeLessThan(5000); // used to wait the full 8 s shutdown timeout

  const file = path.join(boardsDir(), 'board-default.json');
  expect(fs.readFileSync(file, 'utf8')).toContain('Written just before quitting');
  expect(fs.existsSync(path.join(boardsDir(), 'catalog.json'))).toBe(true);

  // Lose the browser cache entirely: the board comes back from its file.
  fs.rmSync(path.join(userDataDir, 'Local Storage'), { recursive: true, force: true });
  ({ app, page } = await launch(userDataDir));
  try {
    await expect(page.getByText('Written just before quitting')).toBeVisible();
  } finally {
    await quit(app);
  }
});

test('boards never opened since the upgrade are copied to disk too', async () => {
  // Before this change every board lived only in localStorage.
  let { app, page } = await launch(userDataDir);
  await page.evaluate((board) => {
    localStorage.setItem(
      'foqz_multiboards_meta_v1',
      JSON.stringify([
        { id: 'board-default', name: 'Foqz Board 1', createdAt: 1 },
        { id: 'board-old', name: 'Old board', createdAt: 2 },
      ]),
    );
    localStorage.setItem('foqz_board_snapshot_board-old', board);
  }, boardJson([textNode('old', 'Only in the old cache')]));
  await quit(app);
  fs.rmSync(boardsDir(), { recursive: true, force: true });

  ({ app, page } = await launch(userDataDir));
  await expect.poll(() => fs.existsSync(path.join(boardsDir(), 'board-old.json'))).toBe(true);
  expect(fs.readFileSync(path.join(boardsDir(), 'catalog.json'), 'utf8')).toContain('board-old');
  await quit(app);

  fs.rmSync(path.join(userDataDir, 'Local Storage'), { recursive: true, force: true });
  ({ app, page } = await launch(userDataDir));
  try {
    await page.evaluate(() => (window as any).useFlowCanvasStore.getState().switchBoard('board-old'));
    await expect(page.getByText('Only in the old cache')).toBeVisible();
  } finally {
    await quit(app);
  }
});

test('a board file that cannot be read is kept, and a backup can be restored', async () => {
  const broken = '{"version": 2, "nodes": [';
  fs.mkdirSync(path.join(boardsDir(), 'backups', 'board-default'), { recursive: true });
  fs.writeFileSync(path.join(boardsDir(), 'board-default.json'), broken);
  const backupAt = Date.now() - 60 * 60 * 1000;
  fs.writeFileSync(
    path.join(boardsDir(), 'backups', 'board-default', `${backupAt}.json`),
    boardJson([textNode('from-backup', 'Restored from a backup')], backupAt),
  );

  const { app, page } = await launch(userDataDir);
  try {
    await expect(page.getByRole('alert')).toContainText('couldn’t be read');
    await expect(page.getByText('React Flow Migration Milestone')).toHaveCount(0);

    // The unreadable file is kept once, and autosave doesn't destroy it.
    await page.waitForTimeout(1500);
    const kept = fs.readdirSync(path.join(boardsDir(), 'unreadable'));
    expect(kept.filter((f) => fs.readFileSync(path.join(boardsDir(), 'unreadable', f), 'utf8') === broken)).toHaveLength(1);
    await page.screenshot({ path: 'test-results/storage-electron-unreadable.png' });

    await page.getByRole('button', { name: 'Restore from backup…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Restore from backup' });
    // Newest first: the damaged file (backed up when the empty board replaced it), then the seeded one.
    const restoreButtons = dialog.getByRole('button', { name: /^Restore backup from/ });
    await expect(restoreButtons).toHaveCount(2);
    await page.screenshot({ path: 'test-results/storage-electron-restore.png' });
    await restoreButtons.last().click();

    await expect(page.getByText('Restored from a backup')).toBeVisible();
    await expect(page.getByRole('alert')).toBeHidden();
    await expect
      .poll(() => fs.readFileSync(path.join(boardsDir(), 'board-default.json'), 'utf8'))
      .toContain('Restored from a backup');
  } finally {
    await quit(app);
  }
});

test('the board menu lists backups taken while editing', async () => {
  fs.mkdirSync(boardsDir(), { recursive: true });
  fs.writeFileSync(path.join(boardsDir(), 'board-default.json'), boardJson([textNode('v1', 'First version')]));

  const { app, page } = await launch(userDataDir);
  try {
    await expect(page.getByText('First version')).toBeVisible();
    await page.evaluate(() => {
      const s = (window as any).useFlowCanvasStore.getState();
      s.setNodes([{ id: 'v2', type: 'text', position: { x: 120, y: 120 }, data: { text: 'Second version' } }]);
    });
    // The first save replaces the original file, which is backed up.
    await expect.poll(() => fs.existsSync(path.join(boardsDir(), 'backups', 'board-default'))).toBe(true);

    await page.locator('button[title="Board actions & exports"]').click();
    await page.getByRole('button', { name: 'Restore from backup…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Restore from backup' });
    await dialog.getByRole('button', { name: /^Restore backup from/ }).first().click();
    await expect(page.getByText('First version')).toBeVisible();

    // Restoring is one undo step.
    await page.evaluate(() => (window as any).useFlowCanvasStore.temporal.getState().undo());
    await expect(page.getByText('Second version')).toBeVisible();
  } finally {
    await quit(app);
  }
});
