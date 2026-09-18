import type { Editor, TLShape } from 'tldraw'
import type { McpTool, McpToolCallResult } from './mcpTypes'
import {
  spawnShapesOnCanvas,
  spawnWorkflowForProject,
  type SpawnableShape,
} from './canvasSpawner'
import { getCanvasContext } from './canvasContext'
import type { TLProjectFrameShape } from '@/shapes/projectFrame/ProjectFrameShapeUtil'

/**
 * Built-in native tools exposed by the Foqz spatial canvas.
 */
export const NATIVE_FOQZ_TOOLS: McpTool[] = [
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
        if (primaryShape && primaryShape.type === 'project-frame') {
          count = spawnWorkflowForProject(
            editor,
            primaryShape as TLProjectFrameShape,
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
        const count = spawnShapesOnCanvas(editor, primaryShape, spawnActions)
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
        const count = spawnShapesOnCanvas(editor, primaryShape, spawnActions)
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

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown canvas tool: ${toolName}` }],
        }
    }
  }
}
