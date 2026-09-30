import {
  parseAgentMarkdown,
  parseSkillMarkdown,
  type AgentProfile,
  type CustomSkill,
} from './agentProfiles'

export function normalizeGithubRepoInput(input: string): string {
  let trimmed = input.trim()
  if (!trimmed) return ''
  trimmed = trimmed.replace(/^git@github\.com:/, '')
  trimmed = trimmed.replace(/^https?:\/\/(www\.)?github\.com\//, '')
  trimmed = trimmed.replace(/\.git$/, '')
  trimmed = trimmed.replace(/[?#].*$/, '')
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`
  }
  return trimmed
}

export interface DiscoveredAgentFile {
  path: string
  content: string
  profile: AgentProfile
}

export interface DiscoveredSkillFile {
  path: string
  content: string
  skill: CustomSkill
}

export interface RepoDiscoveryResult {
  agents: DiscoveredAgentFile[]
  skills: DiscoveredSkillFile[]
  errors?: string[]
}

const CANDIDATE_AGENT_PATHS = [
  'AGENT.md',
  '.foqz/AGENT.md',
  '.agents/AGENT.md',
  'agents/AGENT.md',
  '.github/AGENT.md',
]

const CANDIDATE_SKILL_PATHS = [
  'SKILL.md',
  '.foqz/SKILL.md',
  'skills/SKILL.md',
  '.agents/SKILL.md',
  '.foqz/skills/SKILL.md',
]

/**
 * Helper to fetch file content from GitHub using MCP or raw GitHub endpoints
 */
async function fetchGithubFileContent(owner: string, repo: string, path: string): Promise<string | null> {
  // 1. Try MCP github tool if available
  if (typeof window !== 'undefined' && (window as any).focusStore?.mcp?.callTool) {
    try {
      const res: any = await (window as any).focusStore.mcp.callTool('github', 'get_file_contents', {
        owner,
        repo,
        path,
      })
      if (res) {
        if (typeof res === 'string' && res.trim()) return res
        if (typeof res === 'object' && res.content) {
          if (res.encoding === 'base64') {
            return decodeURIComponent(escape(atob(res.content.replace(/\s/g, ''))))
          }
          return res.content
        }
      }
    } catch {}
  }

  // 2. Try raw github usercontent across main branches
  const branches = ['main', 'master', 'HEAD']
  for (const branch of branches) {
    try {
      const resp = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`)
      if (resp.ok) {
        const text = await resp.text()
        if (text && !text.includes('404: Not Found') && text.trim().length > 10) {
          return text
        }
      }
    } catch {}
  }

  return null
}

/**
 * Scans a connected GitHub repository for custom AGENT.md and SKILL.md files.
 */
export async function discoverRepoAgentFiles(repoInput: string): Promise<RepoDiscoveryResult> {
  const normalized = normalizeGithubRepoInput(repoInput)
  if (!normalized || !normalized.includes('/')) {
    throw new Error('Please specify a valid GitHub repository (e.g. owner/repo).')
  }

  const [owner, repo] = normalized.split('/')
  const discoveredAgents: DiscoveredAgentFile[] = []
  const discoveredSkills: DiscoveredSkillFile[] = []
  const errors: string[] = []

  // Discover Agents
  for (const path of CANDIDATE_AGENT_PATHS) {
    try {
      const content = await fetchGithubFileContent(owner, repo, path)
      if (content) {
        const profile = parseAgentMarkdown(content, `${owner}-${repo}-${path.replace(/[^a-z0-9]+/gi, '-')}`)
        discoveredAgents.push({ path, content, profile })
      }
    } catch (e: any) {
      errors.push(`Failed to fetch ${path}: ${e.message}`)
    }
  }

  // Discover Skills
  for (const path of CANDIDATE_SKILL_PATHS) {
    try {
      const content = await fetchGithubFileContent(owner, repo, path)
      if (content) {
        const skill = parseSkillMarkdown(content, `${owner}-${repo}-${path.replace(/[^a-z0-9]+/gi, '-')}`)
        discoveredSkills.push({ path, content, skill })
      }
    } catch (e: any) {
      errors.push(`Failed to fetch ${path}: ${e.message}`)
    }
  }

  return {
    agents: discoveredAgents,
    skills: discoveredSkills,
    errors: errors.length > 0 ? errors : undefined,
  }
}
