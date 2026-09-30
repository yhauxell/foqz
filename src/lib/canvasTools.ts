import type { Edge } from '@xyflow/react'
import type { McpTool, McpToolCallResult } from './mcpTypes'
import { getFlowCanvasContext, getFlowProjectFrameContents } from './canvasContext'
import {
  prioritizeDailyFocusSlot,
  auditPortfolioProjects,
  evaluateTaskActionability,
  evaluateProjectReadiness,
} from './jev'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'

/**
 * Built-in native tools exposed by the Foqz spatial canvas (React Flow).
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
  {
    serverName: 'foqz',
    name: 'update_node',
    description:
      'Updates attributes of the active or specified canvas node (task title, notes, status, priority, paper theme, project goal). Defaults to the selected node if nodeId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'Optional ID of the node to update. Defaults to the currently selected node if omitted.',
        },
        title: {
          type: 'string',
          description: 'New title or label for the node.',
        },
        notes: {
          type: 'string',
          description: 'Replaces existing notes or markdown content.',
        },
        text: {
          type: 'string',
          description: 'Replaces note text or body content on a note or text node.',
        },
        appendNotes: {
          type: 'string',
          description: 'Appends markdown text or checklists to existing notes.',
        },
        status: {
          type: 'string',
          enum: ['open', 'doing', 'done'],
          description: 'Task execution status.',
        },
        priority: {
          type: 'number',
          enum: [1, 2, 3, 4],
          description:
            'Priority level: 1=Urgent (red), 2=High (orange), 3=Normal (blue), 4=Low (grey).',
        },
        paper: {
          type: 'string',
          enum: ['cream', 'fog', 'bloom', 'sage'],
          description: 'Paper visual theme.',
        },
        goal: {
          type: 'string',
          description: 'Project frame goal.',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'spawn_notes',
    description:
      'Spawn one or more tactile paper sticky notes directly on the spatial canvas board.',
    inputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          description: 'Array of sticky note items to create',
          items: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Title of the sticky note',
              },
              text: {
                type: 'string',
                description: 'Body text content or markdown for the note',
              },
              variant: {
                type: 'string',
                enum: ['yellow', 'amber', 'cream', 'white', 'blue', 'green', 'rose', 'purple', 'zinc'],
                description: 'Paper background theme (default: yellow)',
              },
            },
            required: ['text'],
          },
        },
      },
      required: ['notes'],
    },
  },
  {
    serverName: 'foqz',
    name: 'expand_task',
    description:
      'Deconstructs a focus task or sticky note into subtasks, placing them directly below the parent item on the canvas and wiring semantic dependency edges. Defaults to the selected node if taskId/nodeId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description:
            'Optional ID of parent task or note to expand. Defaults to the currently selected item if omitted.',
        },
        nodeId: {
          type: 'string',
          description:
            'Optional ID of parent task or note to expand. Defaults to the currently selected item if omitted.',
        },
        subtasks: {
          type: 'array',
          description: 'Array of concrete subtask objects to spawn under the parent task or note.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Title of the subtask' },
              priority: {
                type: 'number',
                enum: [1, 2, 3, 4],
                description: 'Priority level 1-4 (default: 3)',
              },
              notes: {
                type: 'string',
                description: 'Optional details, acceptance criteria, or markdown notes',
              },
            },
            required: ['title'],
          },
        },
        linkMode: {
          type: 'string',
          enum: ['chain', 'fanout'],
          default: 'chain',
          description:
            'Dependency link pattern: "chain" (Parent -> T1 -> T2 -> T3) or "fanout" (Parent -> T1, Parent -> T2, Parent -> T3).',
        },
      },
      required: ['subtasks'],
    },
  },
  {
    serverName: 'foqz',
    name: 'connect_nodes',
    description:
      'Connects two canvas nodes with a semantic relationship edge (depends, blocks, or aggregates).',
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: {
          type: 'string',
          description: 'Source node ID.',
        },
        targetId: {
          type: 'string',
          description: 'Target node ID.',
        },
        relation: {
          type: 'string',
          enum: ['depends', 'blocks', 'aggregates'],
          default: 'depends',
          description: 'Semantic relation type between source and target nodes.',
        },
        animated: {
          type: 'boolean',
          default: false,
          description: 'Whether the edge connection line is animated.',
        },
      },
      required: ['sourceId', 'targetId'],
    },
  },
  {
    serverName: 'foqz',
    name: 'start_focus_session',
    description:
      'Activates a task as the single active focus card and starts the Mono-Heartbeat timer countdown. Defaults to the selected task if taskId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description:
            'Optional ID of task to focus. Defaults to currently selected task.',
        },
        durationMinutes: {
          type: 'number',
          default: 25,
          description: 'Duration in minutes for the focus countdown timer (default: 25).',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'delete_node',
    description:
      'Deletes a node from the canvas and cascades removal of attached edges. Defaults to the selected node if nodeId is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeId: {
          type: 'string',
          description:
            'Optional ID of node to delete. Defaults to currently selected node.',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'stop_focus_session',
    description:
      'Stops and exits the active focus session, resetting timers and unlocking the canvas.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    serverName: 'foqz',
    name: 'jev_evaluate_task',
    description:
      'Runs a TypeSafe Jev System One actionability judgment on a task card to evaluate whether it is ready for execution (0-100%) or needs decomposition.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description:
            'Optional ID of task to evaluate. Defaults to currently selected task.',
        },
      },
    },
  },
  {
    serverName: 'foqz',
    name: 'jev_evaluate_project',
    description:
      'Evaluates the execution readiness, milestone clarity, and unbroken path of next steps for a project frame using TypeSafe Jev System One intelligence.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'Optional ID of project frame to evaluate. Defaults to currently selected project.',
        },
      },
    },
  },
]

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
    const { nodes, edges, selectedNodeId, createTask } = store
    const normalizedName = toolName.replace(/^(foqz[_:]+)/, '')

    switch (normalizedName) {
      case 'spawn_tasks': {
        const liveStore = useFlowCanvasStore.getState()
        let rawTasks = args.tasks
        if (typeof rawTasks === 'string') {
          try {
            rawTasks = JSON.parse(rawTasks)
          } catch {
            // ignore
          }
        }
        if (!Array.isArray(rawTasks)) {
          if (rawTasks && typeof rawTasks === 'object' && (rawTasks.title || rawTasks.text)) {
            rawTasks = [rawTasks]
          } else if (args.title || args.text) {
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

        const selectedNode = liveStore.nodes.find((n) => n.id === (defaultNodeId || liveStore.selectedNodeId))
        const selectedFrame = selectedNode?.type === 'projectFrame' ? selectedNode : null
        const parentId = selectedFrame?.id || selectedNode?.parentId
        const isSelectedNote = selectedNode?.type === 'note'
        const noteH = Number(selectedNode?.style?.height ?? selectedNode?.height ?? 180)

        let count = 0
        const createdIds: string[] = []
        for (let i = 0; i < rawTasks.length; i++) {
          const t = rawTasks[i]
          if (t.type === 'note' || (t.text && !t.title)) {
            const newId = liveStore.createNote({
              title: t.title || 'Note',
              text: t.text || t.notes || '',
              variant: t.variant || t.color || 'yellow',
              parentId,
              position: isSelectedNote
                ? {
                    x: Math.round(selectedNode.position.x),
                    y: Math.round(selectedNode.position.y + noteH + 24 + 195 * count),
                  }
                : undefined,
            })
            createdIds.push(newId)
          } else {
            const newId = liveStore.createTask({
              title: String(t.title || 'Untitled Task'),
              priority: typeof t.priority === 'number' ? t.priority : 3,
              notes: t.notes ? String(t.notes) : undefined,
              parentId,
              position: isSelectedNote
                ? {
                    x: Math.round(selectedNode.position.x),
                    y: Math.round(selectedNode.position.y + noteH + 24 + 95 * count),
                  }
                : undefined,
            })
            createdIds.push(newId)
          }
          count++
        }

        if (isSelectedNote && createdIds.length > 0) {
          const newEdges: Edge[] = createdIds.map((cid) => ({
            id: `e-${selectedNode.id}-${cid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: 'semantic',
            source: selectedNode.id,
            sourceHandle: 'bottom',
            target: cid,
            targetHandle: 'top',
            animated: false,
            data: { relation: 'depends' },
          }))
          liveStore.setEdges((prev) => [...prev, ...newEdges])
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully created ${count} item${count === 1 ? '' : 's'} on the canvas.`,
            },
          ],
        }
      }

      case 'spawn_notes': {
        const liveStore = useFlowCanvasStore.getState()
        let rawNotes = args.notes
        if (typeof rawNotes === 'string') {
          try {
            rawNotes = JSON.parse(rawNotes)
          } catch {}
        }
        if (!Array.isArray(rawNotes)) {
          if (rawNotes && typeof rawNotes === 'object') {
            rawNotes = [rawNotes]
          } else if (args.text || args.title) {
            rawNotes = [args]
          } else {
            rawNotes = []
          }
        }
        if (rawNotes.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No notes provided to spawn.' }],
          }
        }

        const selectedNode = liveStore.nodes.find((n) => n.id === (defaultNodeId || liveStore.selectedNodeId))
        const parentId = selectedNode?.type === 'projectFrame' ? selectedNode.id : selectedNode?.parentId

        let count = 0
        for (let i = 0; i < rawNotes.length; i++) {
          const n = rawNotes[i]
          const notePos = selectedNode
            ? {
                x: Math.round(selectedNode.position.x + 260 * (i + 1)),
                y: Math.round(selectedNode.position.y),
              }
            : undefined

          liveStore.createNote({
            title: n.title || 'Note',
            text: n.text || n.notes || '',
            variant: n.variant || n.color || 'yellow',
            parentId,
            position: notePos,
          })
          count++
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully created ${count} sticky note${count === 1 ? '' : 's'} on the canvas.`,
            },
          ],
        }
      }

      case 'get_canvas_summary': {
        const ctx = getFlowCanvasContext(nodes, edges, selectedNodeId)
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

        const ctx = getFlowCanvasContext(nodes, edges, selectedNodeId)
        const currentGoal =
          args.criteria ||
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
          // Heuristic ranking fallback
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
        const projectFrames = nodes.filter((n) => n.type === 'projectFrame')

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

        const projectsInput = projectFrames.map((pf) => {
          const contents = getFlowProjectFrameContents(nodes, pf.id)
          const tasksInFrame = (contents?.containedShapes || []).filter(
            (c) => c.type === 'focusTask'
          )

          const doneTasks = tasksInFrame.filter(
            (t) => t.shape?.data?.status === 'done'
          ).length
          const openTasks = tasksInFrame
            .filter((t) => t.shape?.data?.status !== 'done')
            .map((t) => ({
              id: t.id,
              title: t.shape?.data?.title || 'Untitled Task',
              priority: t.shape?.data?.priority || 3,
              notes: t.shape?.data?.notes,
            }))

          const d = (pf.data || {}) as Record<string, any>
          return {
            id: pf.id,
            title: String(d.title || 'Untitled Project'),
            goal: String(d.goal || ''),
            projectContext: d.projectContext,
            totalTasks: tasksInFrame.length,
            doneTasks,
            openTasks,
            connectors: d.connectors,
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

      case 'update_node': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.nodeId || args.taskId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No nodeId specified and no node currently selected to update.' }],
          }
        }
        const targetNode = liveStore.nodes.find((n) => n.id === targetId)
        if (!targetNode) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Node "${targetId}" not found on canvas.` }],
          }
        }

        const patch: Record<string, any> = {}
        if (args.title !== undefined) {
          patch.title = String(args.title)
          if (targetNode.type === 'box' || targetNode.type === 'circle') {
            patch.label = String(args.title)
          } else if (targetNode.type === 'text') {
            patch.text = String(args.title)
          }
        }
        if (args.text !== undefined) {
          patch.text = String(args.text)
        }
        if (args.notes !== undefined) {
          patch.notes = String(args.notes)
          if (targetNode.type === 'note' && args.text === undefined) {
            patch.text = String(args.notes)
          }
        }
        if (args.appendNotes !== undefined) {
          const baseContent = patch.text !== undefined
            ? patch.text
            : patch.notes !== undefined
            ? patch.notes
            : ((targetNode.data as any)?.text || (targetNode.data as any)?.notes || '')
          const combined = baseContent ? `${baseContent}\n${args.appendNotes}` : String(args.appendNotes)
          patch.notes = combined
          if (targetNode.type === 'note' || targetNode.type === 'text') {
            patch.text = combined
          }
        }
        if (args.status !== undefined) {
          patch.status = args.status
        }
        if (args.priority !== undefined) {
          patch.priority = Number(args.priority)
        }
        if (args.paper !== undefined) {
          patch.paper = args.paper
          if (targetNode.type === 'note') {
            patch.variant =
              args.paper === 'fog'
                ? 'blue'
                : args.paper === 'sage'
                ? 'green'
                : args.paper === 'bloom'
                ? 'rose'
                : 'yellow'
          }
        }
        if (args.variant !== undefined) {
          patch.variant = args.variant
        }
        if (args.goal !== undefined) {
          patch.goal = String(args.goal)
        }

        if (Object.keys(patch).length === 0) {
          return {
            isError: false,
            content: [{ type: 'text', text: `No attributes provided to update on node "${targetId}".` }],
          }
        }

        liveStore.updateNodeData(targetId, patch)

        if (patch.notes && targetNode.type === 'focusTask') {
          const currentH = Number(targetNode.style?.height ?? targetNode.height ?? 82)
          const lines = (patch.notes.match(/\n/g) || []).length + 1
          const neededH = Math.max(currentH, Math.min(380, 84 + lines * 24))
          if (neededH > currentH) {
            liveStore.setNodes((prev) =>
              prev.map((n) => (n.id === targetId ? { ...n, style: { ...n.style, height: neededH } } : n))
            )
          }
        }

        const updatedTitle = patch.title || (targetNode.data as any)?.title || targetId

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully updated node "${updatedTitle}" (${targetId}). Changed attributes: ${Object.keys(patch).join(', ')}.`,
            },
          ],
        }
      }

      case 'expand_task': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.nodeId || args.taskId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No taskId specified and no task currently selected to expand.' }],
          }
        }
        const parentTask = liveStore.nodes.find((n) => n.id === targetId)
        if (!parentTask) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${targetId}" not found on canvas.` }],
          }
        }

        let rawSubtasks = args.subtasks
        if (typeof rawSubtasks === 'string') {
          try {
            rawSubtasks = JSON.parse(rawSubtasks)
          } catch {}
        }
        if (!Array.isArray(rawSubtasks) || rawSubtasks.length === 0) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No subtasks provided to expand.' }],
          }
        }

        const linkMode = args.linkMode === 'fanout' ? 'fanout' : 'chain'
        const isProjectFrame = parentTask.type === 'projectFrame'
        const isNote = parentTask.type === 'note'
        const existingTasksCount = liveStore.nodes.filter(
          (n) => n.parentId === (isProjectFrame ? parentTask.id : parentTask.parentId) && (n.type === 'focusTask' || n.type === 'note')
        ).length

        const parentId = isProjectFrame ? parentTask.id : parentTask.parentId
        const parentX = isProjectFrame ? 40 : parentTask.position.x
        const parentH = Number(parentTask.style?.height ?? parentTask.height ?? (isNote ? 180 : 82))
        const parentY = isProjectFrame ? 100 + existingTasksCount * 94 : parentTask.position.y

        // Auto-expand frame height: if parentId exists, check if neededHeight exceeds containing project frame height
        if (parentId) {
          const frameNode = liveStore.nodes.find((n) => n.id === parentId && n.type === 'projectFrame')
          if (frameNode) {
            const currentHeight = Number(frameNode.style?.height ?? frameNode.height ?? 420)
            const neededHeight = Math.round(
              isProjectFrame
                ? parentY + 95 * (rawSubtasks.length + 1) + 40
                : parentY + parentH + 24 + 95 * rawSubtasks.length + 40
            )
            if (neededHeight > currentHeight) {
              liveStore.setNodes((nodes) =>
                nodes.map((n) =>
                  n.id === parentId
                    ? {
                        ...n,
                        style: { ...n.style, height: neededHeight },
                      }
                    : n
                )
              )
            }
          }
        }

        const createdSubtasks: { id: string; title: string }[] = []
        for (let i = 0; i < rawSubtasks.length; i++) {
          const st = rawSubtasks[i]
          const title = typeof st === 'string' ? st : String(st?.title || `Subtask ${i + 1}`)
          const priority = typeof st === 'object' && typeof st?.priority === 'number' ? (st.priority as 1 | 2 | 3 | 4) : 3
          const notes = typeof st === 'object' && st?.notes ? String(st.notes) : undefined

          const subtaskY = isProjectFrame
            ? parentY + 95 * i
            : parentY + parentH + 24 + 95 * i

          const subtaskId = liveStore.createTask({
            title,
            priority,
            notes,
            parentId,
            position: {
              x: Math.round(isProjectFrame ? parentX : parentX + (isNote ? 0 : 28)),
              y: Math.round(subtaskY),
            },
          })
          createdSubtasks.push({ id: subtaskId, title })
        }

        const newEdges: Edge[] = []
        if (isProjectFrame) {
          for (let idx = 1; idx < createdSubtasks.length; idx++) {
            const prev = createdSubtasks[idx - 1]
            const curr = createdSubtasks[idx]
            newEdges.push({
              id: `e-${prev.id}-${curr.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: prev.id,
              sourceHandle: 'bottom',
              target: curr.id,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
          }
        } else if (linkMode === 'fanout') {
          for (const child of createdSubtasks) {
            newEdges.push({
              id: `e-${parentTask.id}-${child.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: parentTask.id,
              sourceHandle: 'bottom',
              target: child.id,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
          }
        } else {
          let prevId = parentTask.id
          for (const child of createdSubtasks) {
            newEdges.push({
              id: `e-${prevId}-${child.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: prevId,
              sourceHandle: 'bottom',
              target: child.id,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
            prevId = child.id
          }
        }

        if (newEdges.length > 0) {
          liveStore.setEdges((prev) => [...prev, ...newEdges])
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully expanded task "${(parentTask.data as any)?.title || parentTask.id}" into ${createdSubtasks.length} subtasks with ${linkMode} dependencies:\n` +
                createdSubtasks.map((st, idx) => `  ${idx + 1}. ${st.title} (id: ${st.id})`).join('\n'),
            },
          ],
        }
      }

      case 'connect_nodes': {
        const liveStore = useFlowCanvasStore.getState()
        const sourceId = String(args.sourceId || '').trim()
        const targetId = String(args.targetId || '').trim()
        if (!sourceId || !targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Both sourceId and targetId are required to connect nodes.' }],
          }
        }

        const sourceNode = liveStore.nodes.find((n) => n.id === sourceId)
        const targetNode = liveStore.nodes.find((n) => n.id === targetId)
        if (!sourceNode || !targetNode) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Cannot connect nodes: ${!sourceNode ? `source "${sourceId}"` : `target "${targetId}"`} not found on canvas.`,
              },
            ],
          }
        }

        const relation = args.relation || 'depends'
        const animated = Boolean(args.animated)
        const existingEdge = liveStore.edges.find((e) => e.source === sourceId && e.target === targetId)

        if (existingEdge) {
          liveStore.updateEdgeData(existingEdge.id, { relation, animated })
          return {
            isError: false,
            content: [
              {
                type: 'text',
                text: `Updated existing edge between "${sourceId}" and "${targetId}" to relation "${relation}".`,
              },
            ],
          }
        }

        const newEdge: Edge = {
          id: `e-${sourceId}-${targetId}-${Date.now()}`,
          type: 'semantic',
          source: sourceId,
          sourceHandle: 'bottom',
          target: targetId,
          targetHandle: 'top',
          animated,
          data: { relation },
        }

        liveStore.setEdges((prev) => [...prev, newEdge])
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully connected "${(sourceNode.data as any)?.title || sourceId}" -> "${(targetNode.data as any)?.title || targetId}" with relation "${relation}".`,
            },
          ],
        }
      }

      case 'start_focus_session': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.nodeId || args.taskId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No taskId specified and no task currently selected to focus.' }],
          }
        }
        const targetNode = liveStore.nodes.find((n) => n.id === targetId)
        if (!targetNode) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${targetId}" not found on canvas.` }],
          }
        }

        const durationMinutes =
          typeof args.durationMinutes === 'number' && args.durationMinutes > 0
            ? args.durationMinutes
            : 25

        liveStore.setActiveFocusNodeId(targetId)
        liveStore.setTimerSecondsRemaining(durationMinutes * 60)
        liveStore.setIsTimerRunning(true)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('foqz:set-focus-target', { detail: { shapeId: targetId } })
          )
        }

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Started ${durationMinutes}-minute focus session on task "${(targetNode.data as any)?.title || targetId}".`,
            },
          ],
        }
      }

      case 'stop_focus_session': {
        const liveStore = useFlowCanvasStore.getState()
        const prevTarget = liveStore.activeFocusNodeId
        liveStore.setActiveFocusNodeId(null)
        liveStore.setIsTimerRunning(false)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('foqz:set-focus-target', { detail: { shapeId: null } })
          )
        }
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: prevTarget
                ? `Exited active focus session on task "${prevTarget}". Canvas unlocked.`
                : 'Exited active focus session. Canvas unlocked.',
            },
          ],
        }
      }

      case 'jev_evaluate_task': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.taskId || args.nodeId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No taskId specified and no task currently selected to evaluate.' }],
          }
        }
        const targetNode = liveStore.nodes.find((n) => n.id === targetId)
        if (!targetNode) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Task "${targetId}" not found on canvas to evaluate.` }],
          }
        }

        const taskData = (targetNode.data || {}) as Record<string, any>
        const evalRes = await evaluateTaskActionability({
          title: taskData.title || targetId,
          notes: taskData.notes,
        })

        const textOutput = `### Evaluation Verdict for "${taskData.title || targetId}"
- **Actionable**: ${evalRes.isActionable ? 'Yes' : 'No'} (${evalRes.probability}% probability)
- **Blast Radius**: \`${evalRes.blastRadius}\`
- **Readiness Score**: ${evalRes.clarityScore}/2
- **Critique**: ${evalRes.critique}

${evalRes.isActionable ? '✅ This task is concrete and ready for a 25-minute focus session.' : '⚠️ This task is broad or ambiguous. Recommended: break it into 3 concrete steps.'}`

        return {
          isError: false,
          content: [{ type: 'text', text: textOutput }],
        }
      }

      case 'delete_node': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.nodeId || args.taskId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No nodeId specified and no node currently selected to delete.' }],
          }
        }
        const targetNode = liveStore.nodes.find((n) => n.id === targetId)
        if (!targetNode) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Node "${targetId}" not found on canvas.` }],
          }
        }

        const title = (targetNode.data as any)?.title || (targetNode.data as any)?.label || targetId
        liveStore.deleteNode(targetId)

        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: `Successfully deleted node "${title}" (${targetId}) from the canvas.`,
            },
          ],
        }
      }

      case 'jev_evaluate_project': {
        const liveStore = useFlowCanvasStore.getState()
        const targetId = args.projectId || args.nodeId || defaultNodeId || liveStore.selectedNodeId
        if (!targetId) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'No projectId specified and no project frame currently selected.' }],
          }
        }
        const targetNode = liveStore.nodes.find((n) => n.id === targetId && n.type === 'projectFrame')
        if (!targetNode) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Project frame "${targetId}" not found on canvas.` }],
          }
        }

        const projectData = (targetNode.data || {}) as Record<string, any>
        const childTasks = liveStore.nodes.filter((n) => n.parentId === targetId && n.type === 'focusTask')
        const openTasks = childTasks.filter((t) => (t.data as any)?.status !== 'done')
        const doneTasks = childTasks.filter((t) => (t.data as any)?.status === 'done')

        const evalRes = await evaluateProjectReadiness({
          title: projectData.title || targetId,
          goal: projectData.goal,
          projectContext: projectData.projectContext,
          totalTasks: childTasks.length,
          openTasks: openTasks.map((t) => ({
            title: (t.data as any)?.title || t.id,
            priority: (t.data as any)?.priority,
            notes: (t.data as any)?.notes,
          })),
          doneTasks: doneTasks.length,
        })

        const textOutput = `### Project Readiness Verdict for "${projectData.title || targetId}"
- **Readiness Score**: ${evalRes.readinessScore}% (${evalRes.isReady ? 'Ready for Execution' : 'Needs Planning'})
- **Execution Path**: \`${evalRes.executionPathStatus}\`
- **Urgency State**: \`${evalRes.urgencyState}\`
- **Active Tasks**: ${openTasks.length} open (${doneTasks.length} completed)
- **Critique**: ${evalRes.critique}
${evalRes.nextRecommendedTask ? `- **Next Recommended Focus**: "${evalRes.nextRecommendedTask}"` : ''}

${evalRes.isReady ? '✅ This project has a concrete, unbroken path to delivery.' : '⚠️ Execution path is ambiguous or missing breakdown. Recommended: break goals into actionable focus tasks.'}`

        return {
          isError: false,
          content: [{ type: 'text', text: textOutput }],
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
