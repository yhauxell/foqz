import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Two-way task <-> GitHub issue sync (status, priority labels, assignee) against an in-memory
 * fake of the GitHub REST API. No real network calls: api.github.com and avatar images are routed.
 */

const REPO = 'acme/widgets';
const ISSUE = 101;

type FakeIssue = {
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
};

type FakeGitHub = {
  issue: FakeIssue;
  /** Non-GET requests, as "METHOD /path body". */
  writes: string[];
  /** Logins GitHub silently refuses to assign (no repo access). */
  rejected: string[];
};

function linkedTask(id: string, title: string, y: number) {
  return {
    id,
    type: 'focusTask',
    position: { x: 760, y },
    style: { width: 300, height: 170 },
    data: {
      title,
      status: 'open',
      priority: 3,
      githubIssueNumber: ISSUE,
      githubRepo: REPO,
      githubIssueUrl: `https://github.com/${REPO}/issues/${ISSUE}`,
      githubAssignee: 'amy',
      githubLabels: ['enhancement'],
    },
  };
}

async function setupFakeGitHub(page: Page): Promise<FakeGitHub> {
  const gh: FakeGitHub = {
    issue: { state: 'open', labels: ['enhancement'], assignees: ['amy'] },
    writes: [],
    rejected: ['mallory'],
  };

  const issueJson = () => ({
    number: ISSUE,
    title: 'Fake issue',
    body: '',
    state: gh.issue.state,
    html_url: `https://github.com/${REPO}/issues/${ISSUE}`,
    labels: gh.issue.labels.map((name) => ({ name })),
    assignee: gh.issue.assignees[0] ? { login: gh.issue.assignees[0] } : null,
    assignees: gh.issue.assignees.map((login) => ({ login })),
    created_at: '2026-01-01T00:00:00Z',
    updated_at: new Date().toISOString(),
  });

  await page.route('https://api.github.com/**', async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    const path = url.pathname.replace(`/repos/${REPO}`, '');
    if (method !== 'GET') gh.writes.push(`${method} ${path}${body ? ' ' + JSON.stringify(body) : ''}`);
    const json = (status: number, data: unknown) => route.fulfill({ status, json: data });

    if (path === `/issues/${ISSUE}` && method === 'GET') return json(200, issueJson());
    if (path === `/issues/${ISSUE}` && method === 'PATCH') {
      if (body.state) gh.issue.state = body.state;
      return json(200, issueJson());
    }
    if (path === `/issues/${ISSUE}/labels` && method === 'POST') {
      for (const l of body.labels) if (!gh.issue.labels.includes(l)) gh.issue.labels.push(l);
      return json(200, gh.issue.labels.map((name) => ({ name })));
    }
    if (path.startsWith(`/issues/${ISSUE}/labels/`) && method === 'DELETE') {
      const name = decodeURIComponent(path.split('/labels/')[1]);
      if (!gh.issue.labels.includes(name)) return json(404, { message: 'Label does not exist' });
      gh.issue.labels = gh.issue.labels.filter((l) => l !== name);
      return json(200, gh.issue.labels.map((n) => ({ name: n })));
    }
    if (path === `/issues/${ISSUE}/assignees`) {
      if (method === 'POST') {
        for (const l of body.assignees) {
          if (!gh.rejected.includes(l) && !gh.issue.assignees.includes(l)) gh.issue.assignees.push(l);
        }
      }
      if (method === 'DELETE') gh.issue.assignees = gh.issue.assignees.filter((a) => !body.assignees.includes(a));
      return json(201, issueJson());
    }
    if (path === '/issues' && method === 'GET') return json(200, [issueJson()]);
    if (path === '/assignees') return json(200, ['amy', 'bob', 'cat', 'mallory'].map((login) => ({ login })));
    if (path.endsWith('/timeline')) return json(200, []);
    return json(404, { message: 'Not Found' });
  });

  // Avatars on the assignee chip come from github.com; keep tests offline.
  await page.route('https://github.com/*.png*', (route) => route.fulfill({ status: 404, body: '' }));

  const board = {
    nodes: [
      {
        id: 'proj-gh',
        type: 'projectFrame',
        position: { x: 60, y: 60 },
        style: { width: 640, height: 360 },
        data: { title: 'Widgets', goal: '', accent: 'blue', borderStyle: 'solid', connectors: { githubRepo: REPO } },
      },
      linkedTask('task-gh', '#101 Fake issue', 120),
      // A duplicated card linked to the same issue (duplicate copies the link).
      linkedTask('task-gh2', '#101 Fake issue (copy)', 420),
    ],
    edges: [],
    annotations: {},
  };
  await page.addInitScript((snapshot) => {
    if (localStorage.getItem('__githubSyncSeeded')) return;
    localStorage.setItem('__githubSyncSeeded', '1');
    localStorage.setItem('foqz_github_token', 'test-token');
    // Manual sync only, so background polling can't race the assertions.
    localStorage.setItem('foqz_github_sync_interval_min', '0');
    localStorage.setItem('foqz_reactflow_poc_board_v1', JSON.stringify(snapshot));
  }, board);

  return gh;
}

const card = (page: Page, id = 'task-gh') => page.locator(`.react-flow__node[data-id="${id}"]`);

async function pickAssignee(page: Page, login: string, id = 'task-gh') {
  await card(page, id).locator('[title^="Assignee:"], [title="Assign on GitHub"]').click();
  await page.getByRole('dialog').getByRole('button', { name: `@${login}`, exact: true }).click();
}

async function syncFrame(page: Page) {
  await page.locator('button[title^="Sync status, priority labels"]').click();
}

test.describe('GitHub two-way task sync', () => {
  let gh: FakeGitHub;

  test.beforeEach(async ({ page }) => {
    gh = await setupFakeGitHub(page);
    await page.goto('/');
    await expect(card(page)).toBeVisible();
  });

  test('marking a task done closes the issue, and undo reopens it', async ({ page }) => {
    await card(page).locator('[title="Mark as completed"]').click();
    await expect.poll(() => gh.issue.state).toBe('closed');
    expect(gh.writes).toEqual([`PATCH /issues/${ISSUE} {"state":"closed"}`]);

    await page.getByRole('banner').getByRole('button', { name: /^Undo/ }).click();
    await expect.poll(() => gh.issue.state).toBe('open');
    expect(gh.writes).toHaveLength(2);
  });

  test('frame Sync pulls status, labels, and assignee changed on GitHub', async ({ page }) => {
    gh.issue = { state: 'closed', labels: ['enhancement', 'urgent'], assignees: ['bob'] };
    await syncFrame(page);

    await expect(card(page).locator('[title="Mark as incomplete"]')).toBeVisible();
    await expect(card(page).locator('[title^="Assignee: @bob"]')).toBeVisible();
    await expect(card(page).getByText('urgent', { exact: true })).toBeVisible();
    expect(gh.writes).toEqual([]);
    await page.screenshot({ path: 'test-results/github-sync-pulled.png' });
  });

  test('reassigning from the card changes only that assignee on GitHub', async ({ page }) => {
    gh.issue.assignees = ['amy', 'dana']; // co-assignee must survive
    await pickAssignee(page, 'cat');

    await expect.poll(() => gh.issue.assignees).toEqual(['dana', 'cat']);
    expect(gh.writes).toEqual([
      `POST /issues/${ISSUE}/assignees {"assignees":["cat"]}`,
      `DELETE /issues/${ISSUE}/assignees {"assignees":["amy"]}`,
    ]);
  });

  test('an assignee GitHub rejects is reverted and reported', async ({ page }) => {
    await pickAssignee(page, 'mallory');

    await expect(card(page).locator('[title*="did not accept @mallory"]')).toBeVisible();
    await expect(card(page).locator('[title^="Assignee: @amy"]')).toBeVisible();
    expect(gh.issue.assignees).toEqual(['amy']);
    expect(gh.writes.some((w) => w.startsWith('DELETE'))).toBe(false);
  });

  test('edits on both sides show a conflict that can be resolved either way', async ({ page }) => {
    gh.issue.assignees = ['bob'];
    await pickAssignee(page, 'cat');

    const banner = card(page).getByText(/changed here and on GitHub/);
    await expect(banner).toBeVisible();
    await expect(card(page).getByText('@bob', { exact: true })).toBeVisible();
    expect(gh.writes).toEqual([]);
    await page.screenshot({ path: 'test-results/github-sync-conflict.png' });

    await card(page).getByRole('button', { name: 'Keep mine' }).click();
    await expect.poll(() => gh.issue.assignees).toEqual(['cat']);
    await expect(banner).toBeHidden();

    gh.issue.assignees = ['bob'];
    await pickAssignee(page, 'amy');
    await expect(banner).toBeVisible();
    gh.writes = [];
    await card(page).getByRole('button', { name: 'Use GitHub' }).click();
    await expect(card(page).locator('[title^="Assignee: @bob"]')).toBeVisible();
    expect(gh.writes).toEqual([]);
  });

  test('duplicated cards linked to one issue converge without flip-flopping', async ({ page }) => {
    await card(page, 'task-gh2').locator('[title="Mark as completed"]').click();
    await expect.poll(() => gh.issue.state).toBe('closed');

    await syncFrame(page);
    await expect(card(page).locator('[title="Mark as incomplete"]')).toBeVisible();
    await syncFrame(page);
    await page.waitForTimeout(2000); // longer than the push debounce

    expect(gh.writes.filter((w) => w.startsWith('PATCH'))).toEqual([`PATCH /issues/${ISSUE} {"state":"closed"}`]);
    expect(gh.issue.state).toBe('closed');
  });
});
