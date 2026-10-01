import { normalizeGithubRepoInput } from './githubAgentSync'

export interface GitHubUser {
  login: string
  avatar_url?: string
  html_url?: string
}

export interface GitHubLabel {
  id?: number
  name: string
  color?: string
  description?: string
}

export interface GitHubIssue {
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  html_url: string
  labels: GitHubLabel[]
  assignee?: GitHubUser | null
  assignees?: GitHubUser[]
  created_at: string
  updated_at: string
  closed_at?: string | null
}

/**
  Retrieve configured GitHub personal access token from window appSettings or MCP config if available.
 */
export function getGithubToken(): string {
  if (typeof window !== 'undefined') {
    // 1. AppSettings
    const settings = (window as any).focusSettingsCache || (window as any).focusAppSettings
    if (settings && settings.githubToken) {
      return settings.githubToken.trim()
    }

    // 2. Local Storage
    try {
      const stored = localStorage.getItem('foqz_github_token')
      if (stored && stored.trim()) return stored.trim()
    } catch {}
  }

  // 3. Process env if present
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim()
    if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) return process.env.GITHUB_PERSONAL_ACCESS_TOKEN.trim()
  }

  return ''
}

/**
 * Normalizes priority (1=Urgent, 2=High, 3=Normal, 4=Low) based on GitHub label strings.
 */
export function mapLabelsToPriority(labels: (GitHubLabel | string)[]): 1 | 2 | 3 | 4 {
  const names = labels
    .map((l) => (typeof l === 'string' ? l : l.name).toLowerCase())
    .filter(Boolean)

  if (names.some((n) => n.includes('p0') || n.includes('critical') || n.includes('urgent'))) {
    return 1
  }
  if (names.some((n) => n.includes('p1') || n.includes('high') || n.includes('bug') || n.includes('priority: high'))) {
    return 2
  }
  if (names.some((n) => n.includes('p3') || n.includes('low') || n.includes('deprioritized'))) {
    return 4
  }
  return 3
}

/**
 * Returns helper API headers for fetch requests.
 */
function getGithubHeaders(): HeadersInit {
  const token = getGithubToken()
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Foqz-Desktop-App',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/**
 * List repository issues with state, label, and text search filtering.
 */
export async function listRepositoryIssues(
  repoInput: string,
  options?: {
    state?: 'open' | 'closed' | 'all'
    labels?: string[]
    search?: string
  }
): Promise<GitHubIssue[]> {
  const repo = normalizeGithubRepoInput(repoInput)
  if (!repo || !repo.includes('/')) {
    throw new Error('Please specify a valid GitHub repository (e.g. owner/repo).')
  }

  // 1. Try MCP GitHub client if available
  if (typeof window !== 'undefined' && (window as any).focusStore?.mcp?.callTool) {
    try {
      const [owner, repoName] = repo.split('/')
      const mcpArgs: any = { owner, repo: repoName, state: options?.state || 'open' }
      if (options?.labels && options.labels.length > 0) {
        mcpArgs.labels = options.labels
      }
      const res: any = await (window as any).focusStore.mcp.callTool('github', 'list_issues', mcpArgs)
      if (Array.isArray(res)) {
        let items: GitHubIssue[] = res.map((i: any) => ({
          number: i.number,
          title: i.title || 'Untitled Issue',
          body: i.body || '',
          state: i.state === 'closed' ? 'closed' : 'open',
          html_url: i.html_url || `https://github.com/${repo}/issues/${i.number}`,
          labels: Array.isArray(i.labels) ? i.labels.map((l: any) => (typeof l === 'string' ? { name: l } : l)) : [],
          assignee: i.assignee ? { login: i.assignee.login || i.assignee } : null,
          created_at: i.created_at || new Date().toISOString(),
          updated_at: i.updated_at || new Date().toISOString(),
        }))

        if (options?.search && options.search.trim()) {
          const q = options.search.toLowerCase()
          items = items.filter(
            (i) => i.title.toLowerCase().includes(q) || (i.body && i.body.toLowerCase().includes(q))
          )
        }
        return items
      }
    } catch (e) {
      console.warn('[githubSync] MCP list_issues failed, falling back to REST API:', e)
    }
  }

  // 2. Direct REST API Call
  const state = options?.state || 'open'
  const params = new URLSearchParams()
  params.set('state', state)
  params.set('per_page', '50')
  if (options?.labels && options.labels.length > 0) {
    params.set('labels', options.labels.join(','))
  }

  const url = `https://api.github.com/repos/${repo}/issues?${params.toString()}`
  const resp = await fetch(url, { headers: getGithubHeaders() })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(
      `GitHub API error (${resp.status}): ${
        resp.status === 404
          ? 'Repository not found or private. Provide a GitHub PAT in Settings.'
          : errText || resp.statusText
      }`
    )
  }

  const data = await resp.json()
  // Filter out Pull Requests (GitHub issues API includes PRs which have a pull_request key)
  let issues: GitHubIssue[] = (data || [])
    .filter((item: any) => !item.pull_request)
    .map((item: any) => ({
      number: item.number,
      title: item.title,
      body: item.body || '',
      state: item.state === 'closed' ? 'closed' : 'open',
      html_url: item.html_url,
      labels: (item.labels || []).map((l: any) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        description: l.description,
      })),
      assignee: item.assignee ? { login: item.assignee.login, avatar_url: item.assignee.avatar_url } : null,
      assignees: (item.assignees || []).map((a: any) => ({ login: a.login, avatar_url: a.avatar_url })),
      created_at: item.created_at,
      updated_at: item.updated_at,
      closed_at: item.closed_at,
    }))

  if (options?.search && options.search.trim()) {
    const q = options.search.toLowerCase()
    issues = issues.filter(
      (i) => i.title.toLowerCase().includes(q) || (i.body && i.body.toLowerCase().includes(q))
    )
  }

  return issues
}

/**
 * Fetch details for a specific GitHub issue.
 */
export async function getIssue(repoInput: string, issueNumber: number): Promise<GitHubIssue> {
  const repo = normalizeGithubRepoInput(repoInput)
  const resp = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    headers: getGithubHeaders(),
  })
  if (!resp.ok) {
    throw new Error(`Failed to fetch issue #${issueNumber} from ${repo}`)
  }
  const item = await resp.json()
  return {
    number: item.number,
    title: item.title,
    body: item.body || '',
    state: item.state === 'closed' ? 'closed' : 'open',
    html_url: item.html_url,
    labels: (item.labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    assignee: item.assignee ? { login: item.assignee.login, avatar_url: item.assignee.avatar_url } : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

/**
 * Create a new issue on GitHub.
 */
export async function createGitHubIssue(
  repoInput: string,
  data: {
    title: string
    body?: string
    labels?: string[]
    assignees?: string[]
  }
): Promise<GitHubIssue> {
  const repo = normalizeGithubRepoInput(repoInput)
  if (!repo || !repo.includes('/')) {
    throw new Error('Please specify a valid GitHub repository (e.g. owner/repo).')
  }

  // 1. Try MCP if available
  if (typeof window !== 'undefined' && (window as any).focusStore?.mcp?.callTool) {
    try {
      const [owner, repoName] = repo.split('/')
      const res: any = await (window as any).focusStore.mcp.callTool('github', 'create_issue', {
        owner,
        repo: repoName,
        title: data.title,
        body: data.body || '',
        labels: data.labels,
        assignees: data.assignees,
      })
      if (res && res.number) {
        return {
          number: res.number,
          title: res.title || data.title,
          body: res.body || data.body || '',
          state: 'open',
          html_url: res.html_url || `https://github.com/${repo}/issues/${res.number}`,
          labels: (data.labels || []).map((l) => ({ name: l })),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }
    } catch (e) {
      console.warn('[githubSync] MCP create_issue failed, falling back to REST API:', e)
    }
  }

  // 2. Direct REST API Call
  const token = getGithubToken()
  if (!token) {
    throw new Error(
      'GitHub Personal Access Token is required to create issues. Please set your token in Focus Settings or MCP configuration.'
    )
  }

  const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      ...getGithubHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: data.title,
      body: data.body || '',
      labels: data.labels || [],
      assignees: data.assignees || [],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`Failed to create issue on GitHub (${resp.status}): ${errText || resp.statusText}`)
  }

  const item = await resp.json()
  return {
    number: item.number,
    title: item.title,
    body: item.body || '',
    state: item.state === 'closed' ? 'closed' : 'open',
    html_url: item.html_url,
    labels: (item.labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    assignee: item.assignee ? { login: item.assignee.login, avatar_url: item.assignee.avatar_url } : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}

/**
 * Update issue status, labels, assignees, title, or body on GitHub.
 */
export async function updateGitHubIssue(
  repoInput: string,
  issueNumber: number,
  data: {
    state?: 'open' | 'closed'
    title?: string
    body?: string
    labels?: string[]
    assignees?: string[]
  }
): Promise<GitHubIssue> {
  const repo = normalizeGithubRepoInput(repoInput)
  if (!repo || !repo.includes('/')) {
    throw new Error('Please specify a valid GitHub repository.')
  }

  const token = getGithubToken()
  if (!token) {
    console.warn('[githubSync] No GitHub token configured. Skipping remote update.')
    throw new Error('GitHub token missing. Configure GitHub Personal Access Token in Settings.')
  }

  const payload: Record<string, any> = {}
  if (data.state) payload.state = data.state
  if (data.title) payload.title = data.title
  if (typeof data.body === 'string') payload.body = data.body
  if (data.labels) payload.labels = data.labels
  if (data.assignees) payload.assignees = data.assignees

  const resp = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    headers: {
      ...getGithubHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`Failed to update issue #${issueNumber} (${resp.status}): ${errText || resp.statusText}`)
  }

  const item = await resp.json()
  return {
    number: item.number,
    title: item.title,
    body: item.body || '',
    state: item.state === 'closed' ? 'closed' : 'open',
    html_url: item.html_url,
    labels: (item.labels || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    assignee: item.assignee ? { login: item.assignee.login, avatar_url: item.assignee.avatar_url } : null,
    created_at: item.created_at,
    updated_at: item.updated_at,
  }
}
