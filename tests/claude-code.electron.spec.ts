import { _electron as electron, test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Local Claude Code runs through the real preload and main process (#88), against a stub
 * `claude` that reports its argv and folder. Launched with a throwaway user-data folder.
 */
const STUB = `#!/usr/bin/env node
const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
let input = ''
process.stdin.on('data', (c) => (input += c))
process.stdin.on('end', () => {
  const args = process.argv.slice(2)
  if (process.env.STUB_HANG) { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); return }
  line({ type: 'system', subtype: 'init', session_id: 'stub', tools: [] })
  line({ type: 'result', is_error: false, result: JSON.stringify({ args, cwd: process.cwd(), input }), session_id: 'stub' })
})
`;

test('runs Claude Code in the item folder with the access Settings grants it', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'foqz-cc-e2e-'));
  const userDataDir = path.join(root, 'profile');
  const repo = path.join(root, 'repo');
  fs.mkdirSync(userDataDir);
  fs.mkdirSync(repo);
  const bin = path.join(root, 'claude');
  fs.writeFileSync(bin, STUB, { mode: 0o755 });
  fs.writeFileSync(
    path.join(userDataDir, 'app-settings.json'),
    JSON.stringify({
      claudeCodeEnabled: true,
      claudeCodePath: bin,
      claudeCodeFolders: [{ path: repo, profile: 'workspace', bashAllowlist: ['npm test'] }],
    }),
  );
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../electron/main.cjs'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
  });
  try {
    const window = await app.firstWindow();
    await window.waitForSelector('.react-flow', { timeout: 20000 });

    const result = await window.evaluate(async ({ repo }) => {
      const api = (window as any).focusStore.claudeCode;
      const access = await api.resolve({ folder: repo });
      const fallback = await api.resolve({});
      const run = (req: any) =>
        new Promise<any>((resolve) => {
          let text = '';
          const offLine = api.onLine((p: any) => {
            if (p.requestId !== req.requestId) return;
            const msg = JSON.parse(p.line);
            if (msg.type === 'result') text = msg.result;
          });
          const offExit = api.onExit((p: any) => {
            if (p.requestId !== req.requestId) return;
            offLine();
            offExit();
            resolve({ exit: p, out: text ? JSON.parse(text) : null });
          });
          api.run(req).then((r: any) => {
            if (!r.ok) resolve({ startError: r.error });
            else (req as any).__res = r;
          });
        });
      const sessionId = '11111111-2222-4333-8444-555555555555';
      const workspace = await run({ requestId: 'w1', prompt: 'hello', folder: repo, nodeId: 'n1', sessionId });
      const canvas = await run({ requestId: 'c1', prompt: 'hi', nodeId: 'n2', sessionId });
      return { access, fallback, workspace, canvas };
    }, { repo });

    expect(result.access).toMatchObject({ ok: true, profile: 'workspace', bashAllowlist: ['npm test'] });
    expect(fs.realpathSync(result.access.cwd)).toBe(fs.realpathSync(repo));
    expect(result.fallback).toMatchObject({ ok: true, isDefault: true, profile: 'canvas' });
    expect(fs.realpathSync(result.fallback.cwd)).toBe(fs.realpathSync(path.join(userDataDir, 'claude-code')));

    const w = result.workspace.out;
    expect(fs.realpathSync(w.cwd)).toBe(fs.realpathSync(repo));
    expect(w.input).toBe('hello');
    expect(w.args).toContain('--session-id');
    expect(w.args[w.args.indexOf('--allowedTools') + 1]).toContain('Bash(npm test:*)');
    expect(w.args[w.args.indexOf('--tools') + 1]).toBe('Read,Glob,Grep,Edit,Write,Bash,ToolSearch');

    const c = result.canvas.out;
    expect(fs.realpathSync(c.cwd)).toBe(fs.realpathSync(path.join(userDataDir, 'claude-code')));
    expect(c.args).toContain('--no-session-persistence');
    expect(c.args[c.args.indexOf('--disallowedTools') + 1]).toBe('Read,Glob,Grep');
    expect(c.args).not.toContain('--session-id');
  } finally {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
