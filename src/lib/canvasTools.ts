import type { Editor, TLShape } from 'tldraw'
import type { McpTool, McpToolCallResult } from './mcpTypes'
import {
  findContainingProjectFrame,
  spawnShapesOnCanvas,
  spawnWorkflowForProject,
  type SpawnableShape,
} from './canvasSpawner'
import { getCanvasContext, extractTextFromShape, getProjectFrameContents } from './canvasContext'
import { prioritizeDailyFocusSlot, auditPortfolioProjects } from './jev'
import type { TLProjectFrameShape } from '@/shapes/projectFrame/ProjectFrameShapeUtil'
import type { TLFocusTaskShape } from '@/shapes/focusTask/FocusTaskShapeUtil'

/**
 * Built-in native tools exposed by the Foqz spatial canvas.
 */
export const NATIVE_FOQZ_TOOLS: McpTool[] = [
  {
    serverName: 'foqz',
    name: 'jev_audit_portfolio',
    description:
      'Audit and prioritize all project frames across the entire canvas using TypeSafe Jev System One intelligence to determine which project and tasks make the most sense to push for today.',
    inputSchema: {
      type: 'object',
      properties: {
        dailyGoal: {
          type: 'string',
          description:
            'Optional specific daily objective or constraint (e.g. "Prepare release demo", "Fix critical bugs")',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'spawn_tasks',
    description:
      'Spawn one or more actionable focus task cards directly on the spatial canvas board.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of task items to create',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the task card',
              },
              priority: {
                type: 'number',
                description:
                  'Priority: 1=Urgent (red), 2=High (orange), 3=Normal (blue), 4=Low (grey)',
                default: 3,
              },
              notes: {
                type: 'string',
                description: 'Optional task details or markdown notes',
              },
              minutes: {
                type: 'number',
                description: 'Estimated focus time in minutes (e.g. 25)',
              },
            },
            required: ['title'],
          },
        },
      },
      required: ['tasks'],
    },
  },
  {
    serverName: 'foqz',
    name: 'create_timer',
    description: 'Place a focus countdown timer on the canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        minutes: {
          type: 'number',
          description: 'Focus timer duration in minutes (e.g. 15, 25, 50)',
          default: 25,
        },
      },
      required: ['minutes'],
    },
  },
  {
    serverName: 'foqz',
    name: 'add_sticky_note',
    description:
      'Add a colorful sticky note on the canvas for brainstorming, tips, or documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text content of the sticky note',
        },
        color: {
          type: 'string',
          description: 'Note color: yellow, blue, green, pink, violet, grey',
          enum: ['yellow', 'blue', 'green', 'pink', 'violet', 'grey'],
          default: 'yellow',
        },
      },
      required: ['text'],
    },
  },
  {
    serverName: 'foqz',
    name: 'get_canvas_summary',
    description:
      'Query the current shapes, active cards, and spatial layout on the user canvas.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all', 'selected'],
          default: 'all',
          description:
            'Whether to return all board items or only currently selected shapes',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'jev_triage_items',
    description:
      'Use TypeSafe Jev System One to triage, score, and prioritize candidate issues, tasks, or features against the active canvas context, strategic goals, actionability, and risk/blast radius.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Candidate tasks or issues to triage and prioritize',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title or summary of the issue/task' },
              description: { type: 'string', description: 'Details, body, or acceptance criteria' },
              id: { type: 'string', description: 'Issue number, ID, or reference' },
            },
            required: ['title'],
          },
        },
        criteria: {
          type: 'string',
          description: 'Optional triage goal or focus criteria (defaults to current canvas context)',
        },
      },
      required: ['items'],
    },
  },
]

/**
 * Creates a tool executor bound to the active tldraw Editor.
 */
export function createCanvasToolExecutor(
  editor: Editor | null,
  getPrimaryShape?: () => TLShape | null | undefined,
) {
  return async (
    toolName: string,
    args: Record<string, any>,
    _serverName?: string,
  ): Promise<McpToolCallResult> => {
    if (!editor) {
      return {
        isError: true,
        content: [
          { type: 'text', text: 'Canvas editor is not mounted or available.' },
        ],
      }
    }

    const primaryShape = getPrimaryShape ? getPrimaryShape() : null
    const normalizedName = toolName.replace(/^(foqz[_:]+)/, '')

    switch (normalizedName) {
      case 'spawn_tasks': {
        let rawTasks = args.tasks
        if (typeof rawTasks === 'string') {
          try {
            rawTasks = JSON.parse(rawTasks)
          } catch {
            // ignore
          }
        }
        if (!Array.isArray(rawTasks)) {
          if (rawTasks && typeof rawTasks === 'object' && rawTasks.title) {
            rawTasks = [rawTasks]
          } else if (args.title) {
            rawTasks = [args]
          } else {
            rawTasks = []
          }
        }
        if (rawTasks.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No tasks provided to spawn.' }],
          }
        }

        const spawnActions: SpawnableShape[] = rawTasks.map((t: any) => ({
          type: 'task',
          title: String(t.title || 'Untitled Task'),
          priority: typeof t.priority === 'number' ? t.priority : 3,
          text: t.notes ? String(t.notes) : undefined,
          minutes: typeof t.minutes === 'number' ? t.minutes : undefined,
        }))

        let count = 0
        const targetProject = findContainingProjectFrame(editor, primaryShape)
        if (targetProject) {
          count = spawnWorkflowForProject(
            editor,
            targetProject,
            spawnActions,
          )
        } else {
          count = spawnShapesOnCanvas(editor, primaryShape, spawnActions)
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully created ${count} task card${count === 1 ? '' : 's'} on the canvas.`,
            },
          ],
        }
      }

      case 'create_timer': {
        const minutes = typeof args.minutes === 'number' ? args.minutes : 25
        const spawnActions: SpawnableShape[] = [{ type: 'timer', minutes }]
        const targetProject = findContainingProjectFrame(editor, primaryShape)
        const count = targetProject
          ? spawnWorkflowForProject(editor, targetProject, spawnActions)
          : spawnShapesOnCanvas(editor, primaryShape, spawnActions)
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Created ${minutes}m focus timer on canvas.`,
            },
          ],
        }
      }

      case 'add_sticky_note': {
        const text = String(args.text || '')
        const color = args.color || 'yellow'
        const spawnActions: SpawnableShape[] = [{ type: 'note', text, color }]
        const targetProject = findContainingProjectFrame(editor, primaryShape)
        const count = targetProject
          ? spawnWorkflowForProject(editor, targetProject, spawnActions)
          : spawnShapesOnCanvas(editor, primaryShape, spawnActions)
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Added sticky note to canvas.`,
            },
          ],
        }
      }

      case 'get_canvas_summary': {
        const ctx = getCanvasContext(editor)
        const summary =
          args.scope === 'selected' && ctx.selectedSummary
            ? ctx.selectedSummary
            : ctx.boardSummary || 'Canvas is currently empty.'
        return {
          isError: false,
          content: [{ type: 'text', text: summary }],
        }
      }

      case 'jev_triage_items': {
        const rawItems = args.items || []
        const candidateItems = Array.isArray(rawItems)
          ? rawItems.map((item: any, i: number) => ({
              id: item.id ? String(item.id) : `item_${i + 1}`,
              title: String(item.title || item.name || 'Untitled item'),
              notes: item.description || item.body || item.notes || '',
            }))
          : []

        if (candidateItems.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No items provided to triage.' }],
          }
        }

        const ctx = getCanvasContext(editor)
        const currentGoal =
          args.criteria ||
          ctx.activeTask?.title ||
          (primaryShape ? extractTextFromShape(primaryShape) : '') ||
          ctx.boardSummary ||
          'Execute core product milestones with minimal blast radius'

        try {
          const result = await prioritizeDailyFocusSlot(currentGoal, candidateItems)
          const formatted = result.rankings
            .map((r, rankIdx) => {
              const priorityNumber = rankIdx === 0 ? 1 : rankIdx === 1 ? 2 : 3
              return `• **Priority P${priorityNumber}** (#${rankIdx + 1}): **${r.title}**\n  - Strategic Alignment: ${r.alignmentScore}/2\n  - Blast Radius: \`${r.blastRadius}\`\n  - Actionable: ${r.isActionable ? 'Yes' : 'Ambiguous'}`
            })
            .join('\n\n')

          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: `**Triage & Prioritization** (Evaluated against canvas goal: "${currentGoal}"):\n\n${formatted}\n\nTop priority to focus next: **${result.rankings[0]?.title}**`,
              },
            ],
          }
        } catch (jevErr: any) {
          // Heuristic ranking fallback if TypeSafe key is offline or unconfigured
          const fallback = candidateItems
            .map((item, i) => {
              const priorityNumber = i === 0 ? 1 : i === 1 ? 2 : 3
              return `• **Priority P${priorityNumber}** (#${i + 1}): **${item.title}**`
            })
            .join('\n')

          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: `**Triage & Prioritization** (${jevErr.message || 'Heuristic ranking'}):\n\n${fallback}`,
              },
            ],
          }
        }
      }

      case 'jev_audit_portfolio': {
        const pageShapes = editor.getCurrentPageShapes()
        const projectFrames = pageShapes.filter(
          (s): s is TLProjectFrameShape => s.type === 'project-frame',
        )

        if (projectFrames.length === 0) {
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: 'No Project Frames found on the canvas. Create a project frame first (⌘⇧P or via the toolbar) to begin organizing and auditing projects.',
              },
            ],
          }
        }

        // Build PortfolioProjectInput for each project frame
        const projectsInput = projectFrames.map((pf) => {
          const contents = getProjectFrameContents(editor, pf.id)
          const tasksInFrame = (contents?.containedShapes || [])
            .map((c) => c.shape)
            .filter((s): s is TLFocusTaskShape => s.type === 'focus-task')

          const doneTasks = tasksInFrame.filter((t) => t.props.status === 'done').length
          const openTasks = tasksInFrame
            .filter((t) => t.props.status !== 'done')
            .map((t) => ({
              id: t.id,
              title: t.props.title || 'Untitled Task',
              priority: t.props.priority || 3,
              notes: t.props.notes,
            }))

          return {
            id: pf.id,
            title: pf.props.title || 'Untitled Project',
            goal: pf.props.goal || '',
            projectContext: pf.props.projectContext,
            totalTasks: tasksInFrame.length,
            doneTasks,
            openTasks,
            connectors: pf.props.connectors,
          }
        })

        try {
          const auditResult = await auditPortfolioProjects(
            projectsInput,
            args.dailyGoal,
          )

          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: auditResult.executiveSummary,
              },
            ],
          }
        } catch (err: any) {
          // Fallback heuristic evaluation if Jev API key is missing
          const fallback = projectsInput
            .map((p, idx) => {
              return `• **#${idx + 1}**: **${p.title}** (${p.doneTasks}/${p.totalTasks} Done) — Goal: "${p.goal || 'No goal set'}"`
            })
            .join('\n')

          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: `### Daily Portfolio Briefing (${err.message || 'Heuristic fallback'})\n\n${fallback}`,
              },
            ],
          }
        }
      }

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown canvas tool: ${toolName}` }],
        }
    }
  }
}
