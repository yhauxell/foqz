import type { Edge, Node } from '@xyflow/react'
import type { McpTool, McpToolCallResult } from './mcpTypes'
import { getFlowCanvasContextAsync } from './canvasContext'
import { createGitHubIssue } from './githubSync'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import {
  convertTextStyle,
  isTextNode,
  nodeTitle,
  setTextStyle,
  startFocus,
  stopFocus,
  textStyleOf,
  type TextStyle,
} from './nodeBehaviors'

/**
 * Built-in native tools exposed by the Foqz canvas, to the inline chat and to
 * external agents through the Foqz MCP host. Kept small on purpose: create,
 * read, change and delete text; break it down; focus; file it on GitHub.
 */
export const NATIVE_FOQZ_TOOLS: McpTool[] = [
  {
    serverName: 'foqz',
    name: 'get_canvas_summary',
    description:
      'Read the board: text, to-dos and their status, regions, connections and annotations the user shared with AI.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'selected'],
          default: 'all',
          description: 'Whole board, or only the current selection.',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'spawn_text',
    description:
      'Write one or more pieces of text on the canvas, next to the selection (or inside the selected region). Set actionable for to-dos.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Text items to create.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Markdown text. First line reads as the title.' },
              actionable: { type: 'boolean', description: 'Make it a to-do with a checkbox.', default: false },
              style: {
                type: 'string',
                enum: ['plain', 'sticky', 'card'],
                default: 'plain',
                description: 'Visual style. Cards are always actionable.',
              },
            },
            required: ['text'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    serverName: 'foqz',
    name: 'update_node',
    description:
      'Change a node: its text, to-do status, style, or a region goal. Defaults to the selected node if nodeId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node to update. Defaults to the selected node.' },
        text: { type: 'string', description: 'Replace the full text (title line + body).' },
        title: { type: 'string', description: 'Replace only the title / first line or a shape label.' },
        appendText: { type: 'string', description: 'Append markdown (e.g. checklist lines) to the body.' },
        status: { type: 'string', enum: ['open', 'done'], description: 'To-do status.' },
        actionable: { type: 'boolean', description: 'Turn the to-do checkbox on or off.' },
        style: { type: 'string', enum: ['plain', 'sticky', 'card'], description: 'Re-style a text node.' },
        goal: { type: 'string', description: 'Region goal.' },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'delete_node',
    description:
      'Delete a node and its connections. Deleting a region keeps what is inside it. Defaults to the selected node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node to delete. Defaults to the selected node.' },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'expand_task',
    description:
      'Break a piece of text (or a region) into smaller to-dos placed right below it and linked with "depends on" edges. Defaults to the selected node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node to expand. Defaults to the selected node.' },
        subtasks: {
          type: 'array',
          description: 'Steps to create, in order.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Step text.' },
            },
            required: ['text'],
          },
        },
        linkMode: {
          type: 'string',
          enum: ['chain', 'fanout'],
          default: 'chain',
          description: '"chain": parent → 1 → 2 → 3. "fanout": parent → each step.',
        },
      },
      required: ['subtasks'],
    },
  },
  {
    serverName: 'foqz',
    name: 'start_focus_session',
    description:
      'Focus on a node where it is: the camera zooms to it, the rest of the board dims and the timer starts. Defaults to the selected node.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Node to focus. Defaults to the selected node.' },
        durationMinutes: { type: 'number', description: 'Timer length. Defaults to the user setting.' },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'stop_focus_session',
    description: 'Leave focus and stop the timer.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    serverName: 'foqz',
    name: 'create_github_issue',
    description:
      'File a GitHub issue from a canvas to-do (and link it) or from a title/body, in the repository of the containing region unless repo is given.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'Canvas item to file and link.' },
        repo: { type: 'string', description: 'owner/repo. Defaults to the containing region repo.' },
        title: { type: 'string', description: 'Issue title. Defaults to the item title.' },
        body: { type: 'string', description: 'Issue body. Defaults to the item body.' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Optional labels.' },
      },
    },
  },
]

/**
 * Names accepted by the executor but not advertised: older Foqz tool names, so agents written
 * against earlier versions keep working.
 */
const TOOL_ALIASES: Record<string, string> = {
  get_board_summary: 'get_canvas_summary',
  create_task: 'spawn_text',
  spawn_tasks: 'spawn_text',
  spawn_notes: 'spawn_text',
  start_timer: 'start_focus_session',
  stop_timer: 'stop_focus_session',
}

const STYLES: TextStyle[] = ['plain', 'sticky', 'card']

function ok(text: string): McpToolCallResult {
  return { isError: false, content: [{ type: 'text', text }] }
}

function fail(text: string): McpToolCallResult {
  return { isError: true, content: [{ type: 'text', text }] }
}

function parseList(raw: unknown): any[] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return raw.trim() ? [raw] : []
    }
  }
  if (Array.isArray(value)) return value
  return value && typeof value === 'object' ? [value] : []
}

/** Normalize a spawn item from any accepted shape (spawn_text, legacy spawn_tasks / spawn_notes). */
function toTextItem(raw: any): { text: string; actionable: boolean; style: TextStyle } | null {
  if (typeof raw === 'string') return raw.trim() ? { text: raw, actionable: false, style: 'plain' } : null
  if (!raw || typeof raw !== 'object') return null
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  const body = String(raw.text ?? raw.notes ?? '').trim()
  const text = title && body && !body.startsWith(title) ? `${title}\n${body}` : title || body
  if (!text) return null
  const style: TextStyle = STYLES.includes(raw.style) ? raw.style : raw.type === 'note' ? 'sticky' : 'plain'
  // Legacy spawn_tasks items were to-dos; spawn_notes items were not.
  const legacyTask = raw.title !== undefined && raw.text === undefined && raw.type !== 'note'
  return { text, actionable: Boolean(raw.actionable ?? legacyTask), style }
}

function nodeSize(n: Node) {
  return {
    w: Number(n.measured?.width ?? n.style?.width ?? n.width ?? 260),
    h: Number(n.measured?.height ?? n.style?.height ?? n.height ?? 90),
  }
}

function newEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'semantic',
    source,
    sourceHandle: 'bottom',
    target,
    targetHandle: 'top',
    data: { relation: 'depends' },
  }
}

/** Replace the body of a text node, whatever its style. */
function textPatch(node: Node, fullText: string): Record<string, any> {
  if (node.type === 'focusTask') {
    const [first, ...rest] = fullText.split('\n')
    return { title: first.trim(), notes: rest.join('\n').trim() }
  }
  return { text: fullText }
}

function bodyText(node: Node): string {
  const d = (node.data || {}) as Record<string, any>
  if (node.type === 'focusTask') return d.notes ? `${d.title || ''}\n${d.notes}` : String(d.title || '')
  return String(d.text ?? d.label ?? '')
}

/**
 * Creates a tool executor bound to the React Flow store.
 */
export function createFlowCanvasToolExecutor(defaultNodeId?: string) {
  return async (
    toolName: string,
    args: Record<string, any>,
    _serverName?: string,
  ): Promise<McpToolCallResult> => {
    const store = useFlowCanvasStore.getState()
    const strippedName = toolName.replace(/^(foqz[_:]+)/, '')
    const normalizedName = TOOL_ALIASES[strippedName] ?? strippedName
    const targetIdFrom = (a: Record<string, any>) =>
      a.nodeId || a.taskId || a.projectId || defaultNodeId || store.selectedNodeId

    switch (normalizedName) {
      case 'get_canvas_summary': {
        const ctx = await getFlowCanvasContextAsync(
          store.nodes,
          store.edges,
          store.selectedNodeId,
          store.annotations,
        )
        const summary =
          args.scope === 'selected' && ctx.selectedSummary
            ? ctx.selectedSummary
            : ctx.boardSummary || 'Canvas is currently empty.'
        return ok(summary)
      }

      case 'spawn_text': {
        const items = parseList(args.items ?? args.tasks ?? args.notes ?? (args.text || args.title ? args : []))
          .map(toTextItem)
          .filter(Boolean) as Array<NonNullable<ReturnType<typeof toTextItem>>>
        if (items.length === 0) return fail('No text provided to write.')

        const selected = store.nodes.find((n) => n.id === (defaultNodeId || store.selectedNodeId))
        const region = selected?.type === 'projectFrame' ? selected : null
        const parentId = region ? region.id : selected?.parentId
        const base = region
          ? { x: 40, y: 80 }
          : selected
          ? { x: selected.position.x + nodeSize(selected).w + 40, y: selected.position.y }
          : store.cursorPosition || { x: 360, y: 240 }

        const created: string[] = []
        items.forEach((item, i) => {
          const id = useFlowCanvasStore.getState().createText({
            text: item.text,
            style: item.style,
            actionable: item.actionable,
            parentId,
            position: { x: Math.round(base.x), y: Math.round(base.y + i * 110) },
            autoEdit: false,
          })
          created.push(id)
        })
        return ok(
          `Wrote ${created.length} item${created.length === 1 ? '' : 's'} on the canvas: ${created.join(', ')}.`,
        )
      }

      case 'update_node': {
        const targetId = targetIdFrom(args)
        if (!targetId) return fail('No nodeId given and nothing is selected.')
        let target = store.nodes.find((n) => n.id === targetId)
        if (!target) return fail(`Node "${targetId}" not found on canvas.`)

        const changed: string[] = []
        if (args.style !== undefined && isTextNode(target) && STYLES.includes(args.style)) {
          const converted = convertTextStyle(target, args.style)
          store.setNodes((prev) => prev.map((n) => (n.id === targetId ? converted : n)))
          target = converted
          changed.push('style')
        }

        const patch: Record<string, any> = {}
        if (args.text !== undefined && isTextNode(target)) {
          Object.assign(patch, textPatch(target, String(args.text)))
        }
        if (args.title !== undefined) {
          const title = String(args.title)
          if (target.type === 'box' || target.type === 'circle') patch.label = title
          else if (target.type === 'projectFrame' || target.type === 'focusTask') patch.title = title
          else if (isTextNode(target)) {
            const [, ...rest] = bodyText(target).split('\n')
            patch.text = [title, ...rest].join('\n')
          }
        }
        if (args.appendText !== undefined || args.appendNotes !== undefined) {
          const extra = String(args.appendText ?? args.appendNotes)
          const current = patch.text ?? (patch.notes !== undefined ? `${patch.title}\n${patch.notes}` : bodyText(target))
          Object.assign(patch, textPatch(target, current ? `${current}\n${extra}` : extra))
        }
        if (args.status === 'open' || args.status === 'done') {
          patch.status = args.status
          if (isTextNode(target)) patch.actionable = true
          if (args.status === 'done') patch.completedVia = 'agent'
        }
        if (typeof args.actionable === 'boolean' && isTextNode(target) && target.type !== 'focusTask') {
          patch.actionable = args.actionable
          if (args.actionable && !(target.data as any)?.status) patch.status = 'open'
        }
        if (args.goal !== undefined && target.type === 'projectFrame') patch.goal = String(args.goal)

        if (Object.keys(patch).length > 0) {
          useFlowCanvasStore.getState().updateNodeData(targetId, patch)
          changed.push(...Object.keys(patch))
        }
        if (changed.length === 0) return ok(`Nothing to change on "${nodeTitle(target)}" (${targetId}).`)
        return ok(`Updated "${nodeTitle(target)}" (${targetId}): ${[...new Set(changed)].join(', ')}.`)
      }

      case 'delete_node': {
        const targetId = targetIdFrom(args)
        if (!targetId) return fail('No nodeId given and nothing is selected.')
        const target = store.nodes.find((n) => n.id === targetId)
        if (!target) return fail(`Node "${targetId}" not found on canvas.`)
        store.deleteNode(targetId)
        return ok(`Deleted "${nodeTitle(target)}" (${targetId}).`)
      }

      case 'expand_task': {
        const targetId = targetIdFrom(args)
        if (!targetId) return fail('No nodeId given and nothing is selected.')
        const parent = store.nodes.find((n) => n.id === targetId)
        if (!parent) return fail(`Node "${targetId}" not found on canvas.`)

        const steps = parseList(args.subtasks)
          .map((s) => (typeof s === 'string' ? s : String(s?.text ?? s?.title ?? '')).trim())
          .filter(Boolean)
        if (steps.length === 0) return fail('No steps provided to expand into.')

        const isRegion = parent.type === 'projectFrame'
        const parentId = isRegion ? parent.id : parent.parentId
        const { h } = nodeSize(parent)
        const style: TextStyle = textStyleOf(parent) === 'card' ? 'card' : 'plain'
        const startX = isRegion ? 40 : parent.position.x + 28
        const startY = isRegion
          ? 80 + store.nodes.filter((n) => n.parentId === parent.id).length * 100
          : parent.position.y + h + 24

        const created: Array<{ id: string; text: string }> = []
        steps.forEach((text, i) => {
          const id = useFlowCanvasStore.getState().createText({
            text,
            style,
            actionable: true,
            parentId,
            position: { x: Math.round(startX), y: Math.round(startY + i * 100) },
            autoEdit: false,
          })
          created.push({ id, text })
        })

        const edges: Edge[] = []
        if (isRegion) {
          for (let i = 1; i < created.length; i++) edges.push(newEdge(created[i - 1].id, created[i].id))
        } else if (args.linkMode === 'fanout') {
          for (const c of created) edges.push(newEdge(parent.id, c.id))
        } else {
          let prev = parent.id
          for (const c of created) {
            edges.push(newEdge(prev, c.id))
            prev = c.id
          }
        }
        if (edges.length > 0) useFlowCanvasStore.getState().setEdges((prev) => [...prev, ...edges])

        return ok(
          `Broke "${nodeTitle(parent)}" into ${created.length} to-dos:\n` +
            created.map((c, i) => `  ${i + 1}. ${c.text} (id: ${c.id})`).join('\n'),
        )
      }

      case 'start_focus_session': {
        const targetId = targetIdFrom(args)
        if (!targetId) return fail('No nodeId given and nothing is selected.')
        const target = store.nodes.find((n) => n.id === targetId)
        if (!target) return fail(`Node "${targetId}" not found on canvas.`)
        const minutes =
          typeof args.durationMinutes === 'number' && args.durationMinutes > 0 ? args.durationMinutes : undefined
        startFocus(targetId, minutes)
        const seconds = useFlowCanvasStore.getState().timerSecondsRemaining
        return ok(`Focusing on "${nodeTitle(target)}" for ${Math.round(seconds / 60)} minutes.`)
      }

      case 'stop_focus_session': {
        const prev = store.activeFocusNodeId
        stopFocus()
        return ok(prev ? `Left focus on "${prev}".` : 'No focus session was active.')
      }

      case 'create_github_issue': {
        const itemId = args.nodeId || args.taskId
        const item = itemId ? store.nodes.find((n) => n.id === itemId) : null

        let repo = args.repo || ''
        if (!repo && item?.parentId) {
          const region = store.nodes.find((n) => n.id === item.parentId && n.type === 'projectFrame')
          repo = (region?.data as any)?.connectors?.githubRepo || ''
        }
        if (!repo) return fail('No repository given and the item is not inside a region linked to a repo.')

        const title = args.title || (item ? nodeTitle(item) : '') || 'New issue'
        const body =
          args.body ||
          (item ? bodyText(item).split('\n').slice(1).join('\n').trim() : '') ||
          ''

        try {
          const issue = await createGitHubIssue(repo, { title, body, labels: args.labels })
          if (item) {
            // GitHub-linked items show as cards: that is where the sync status and assignee live.
            if (item.type !== 'focusTask' && isTextNode(item)) setTextStyle(item.id, 'card')
            useFlowCanvasStore.getState().updateNodeData(item.id, {
              actionable: true,
              status: (item.data as any)?.status || 'open',
              githubIssueNumber: issue.number,
              githubRepo: repo,
              githubIssueUrl: issue.html_url,
              githubSyncStatus: 'synced',
            })
          }
          return ok(`Created GitHub issue #${issue.number} in ${repo}.\nLink: ${issue.html_url}`)
        } catch (err: any) {
          return fail(`Failed to create GitHub issue: ${err.message}`)
        }
      }

      default:
        return fail(`Unknown canvas tool: ${toolName}`)
    }
  }
}
