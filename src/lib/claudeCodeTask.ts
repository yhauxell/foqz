import type { Node } from '@xyflow/react'
import { bodyText, textPatch } from './canvasTools'
import { isActionable, nodeTitle } from './nodePredicates'
import type { ClaudeCodeFolder, ClaudeCodeProfile } from './appSettings'

/**
 * Glue between canvas items and local Claude Code runs (#88): which folder an item runs in,
 * what third-party text could reach the prompt, the prompt for "Run task", and writing the
 * outcome back onto the task.
 */

export const PROFILE_LABELS: Record<ClaudeCodeProfile, string> = {
  canvas: 'Canvas only',
  read: 'Read files',
  workspace: 'Workspace',
}

/** The item's own folder, else its region's; empty means Settings → Intelligence → Working folder. */
export function itemFolder(node: Node | null | undefined, project: Node | null | undefined): string {
  const own = (node?.data as any)?.localFolder
  if (typeof own === 'string' && own.trim()) return own.trim()
  const projectFolder = (project?.data as any)?.connectors?.localFolder
  return typeof projectFolder === 'string' ? projectFolder.trim() : ''
}

export interface UntrustedSource {
  nodeId: string
  /** `owner/repo#123` */
  label: string
  title: string
}

/**
 * Items whose text came from a GitHub issue, which anyone with access to that repository can
 * write. The focused item and its region come first; the rest of the board follows because
 * Claude Code can read any item through the canvas tools.
 */
export function untrustedSources(nodes: Node[], focus: Node | null | undefined, project: Node | null | undefined): UntrustedSource[] {
  const linked = nodes.filter((n) => {
    const d = (n.data || {}) as Record<string, any>
    return Number(d.githubIssueNumber) > 0 && typeof d.githubRepo === 'string' && d.githubRepo.trim()
  })
  const near = (n: Node) => n.id === focus?.id || (project && (n.id === project.id || n.parentId === project.id))
  return [...linked.filter(near), ...linked.filter((n) => !near(n))].map((n) => {
    const d = n.data as Record<string, any>
    return { nodeId: n.id, label: `${String(d.githubRepo).trim()}#${Number(d.githubIssueNumber)}`, title: nodeTitle(n) || '' }
  })
}

/** The prompt "Run task" sends: the task itself, its checklist and its GitHub issue. */
export function buildTaskRunPrompt(node: Node, project: Node | null | undefined): string {
  const d = (node.data || {}) as Record<string, any>
  const [title, ...rest] = bodyText(node).split('\n')
  const body = rest.join('\n').trim()
  const lines = [`Work on this task in the working folder: ${title.trim() || nodeTitle(node) || 'Untitled task'}`]
  if (body) lines.push('', 'Details and checklist:', body)
  if (Number(d.githubIssueNumber) > 0 && d.githubRepo) {
    lines.push('', `It is tracked as GitHub issue ${d.githubRepo}#${d.githubIssueNumber}.`)
  }
  const projectData = (project?.data || {}) as Record<string, any>
  if (project && (projectData.title || projectData.goal)) {
    lines.push('', `It belongs to the region "${projectData.title || 'Untitled'}"${projectData.goal ? ` (goal: ${projectData.goal})` : ''}.`)
  }
  lines.push(
    '',
    'Do the work, then end your reply with a line starting "Summary:" and two or three sentences on what you did and what is left.',
    'Do not change the task\'s status; the user decides when it is done.',
  )
  return lines.join('\n')
}

/** The text after the last "Summary:", else the last paragraph. */
export function extractRunSummary(text: string): string {
  const cleaned = text.replace(/\*\(Claude Code stopped:[^)]*\)\*/g, '').trim()
  const m = cleaned.match(/(?:^|\n)\s*(?:\*\*)?Summary:?(?:\*\*)?:?\s*([\s\S]*)$/i)
  const lastSummary = m ? m[1].trim() : ''
  if (lastSummary) return lastSummary
  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return paragraphs[paragraphs.length - 1] || ''
}

/** Markdown appended to a task after a run from it. */
export function formatRunNote(summary: string, changedFiles: string[], when: Date): string {
  const stamp = when.toISOString().slice(0, 16).replace('T', ' ')
  const lines = [`**Claude Code run (${stamp}):** ${summary || 'No summary.'}`]
  if (changedFiles.length) lines.push(`Changed: ${changedFiles.map((f) => `\`${f}\``).join(', ')}`)
  return lines.join('\n')
}

/** The node patch that appends `note` to a task's body, whatever its style. */
export function appendNotePatch(node: Node, note: string): Record<string, any> {
  const current = bodyText(node)
  return textPatch(node, current ? `${current}\n\n${note}` : note)
}

/** Only to-dos get "Run task". */
export function canRunAsTask(node: Node | null | undefined): node is Node {
  return Boolean(node && isActionable(node))
}

/**
 * Settings' folder list with `path` set to `profile`, keeping its Bash allowlist. Canvas-only
 * without an allowlist is the default, so that entry is dropped instead of stored.
 */
export function withFolderProfile(folders: ClaudeCodeFolder[] | undefined, path: string, profile: ClaudeCodeProfile): ClaudeCodeFolder[] {
  const list = folders || []
  const existing = list.find((f) => f.path === path)
  const rest = list.filter((f) => f.path !== path)
  const bashAllowlist = existing?.bashAllowlist || []
  if (profile === 'canvas' && bashAllowlist.length === 0) return rest
  return [...rest, { path, profile, bashAllowlist }]
}
