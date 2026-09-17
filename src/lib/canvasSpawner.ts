import {
  createShapeId,
  Editor,
  type TLShapeId,
  type TLShape,
  toRichText,
} from 'tldraw'
import type { TLFocusTaskShape } from '../shapes/focusTask/FocusTaskShapeUtil'
import type { TLProjectFrameShape } from '../shapes/projectFrame/ProjectFrameShapeUtil'

export const FOQZ_SYSTEM_PROMPT = `You are an AI assistant and autonomous agent embedded inside Foqz, an infinite-canvas desktop command center.
You have FULL CAPABILITY to create and spawn cards, tasks, sticky notes, and timers directly on the user's canvas.

Whenever the user asks you to:
- Break down a goal, plan, or project into subtasks
- Create or spawn tasks/cards on the canvas
- Add sticky notes, checklists, tips, or documentation
- Set up a workflow

You MUST explain your reasoning clearly AND include a \`\`\`canvas block with a JSON array of shapes to spawn on the board.

Format:
\`\`\`canvas
[
  { "type": "task", "title": "Design authentication database schema", "priority": 1 },
  { "type": "task", "title": "Implement JWT middleware and refresh tokens", "priority": 2 },
  { "type": "task", "title": "Create frontend login & register forms", "priority": 3 },
  { "type": "note", "text": "Security tip: Use bcrypt with salt rounds >= 12 and secure httpOnly cookies.", "color": "yellow" },
  { "type": "timer", "minutes": 25 }
]
\`\`\`

Supported shape types:
- "task": Executable task card. Properties: "title" (string, required), "priority" (number: 1=Urgent, 2=High, 3=Normal, 4=Low).
- "note": Sticky note. Properties: "text" (string, required), "color" ("yellow" | "blue" | "green" | "pink").
- "timer": Countdown timer. Properties: "minutes" (number).

Always output valid JSON inside the \`\`\`canvas block when creating items. Never tell the user you cannot create cards or canvas elements—you DO have this direct ability through the Foqz canvas engine!`

export interface SpawnableShape {
  type: 'task' | 'note' | 'timer'
  title?: string
  text?: string
  priority?: number
  color?: 'yellow' | 'blue' | 'green' | 'pink' | 'red' | 'black' | 'grey' | 'violet'
  minutes?: number
}

export type OutputSegment =
  | { type: 'text'; content: string }
  | { type: 'canvas'; actions: SpawnableShape[]; raw: string }
  | { type: 'streaming-canvas'; raw: string }

export function isValidShape(item: any): item is SpawnableShape {
  return (
    item &&
    typeof item === 'object' &&
    (item.type === 'task' || item.type === 'note' || item.type === 'timer')
  )
}

/**
 * Attempts to parse a JSON array of shapes, cleaning trailing commas and relaxed syntax.
 */
export function tryParseShapesJson(raw: string): SpawnableShape[] | null {
  if (!raw) return null
  const firstBracket = raw.indexOf('[')
  const lastBracket = raw.lastIndexOf(']')
  if (firstBracket === -1) return null

  const jsonSubstring =
    lastBracket > firstBracket
      ? raw.slice(firstBracket, lastBracket + 1)
      : raw.slice(firstBracket) + ']'

  try {
    // Clean trailing commas before } or ]
    const cleaned = jsonSubstring.replace(/,\s*([\]}])/g, '$1')
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isValidShape)
      if (valid.length > 0) return valid
    }
  } catch {
    // Resilient fallback: extract individual shape objects with regex
    try {
      const objectRegex = /\{\s*"type"\s*:\s*"(?:task|note|timer)"[\s\S]*?\}/g
      const matches = jsonSubstring.match(objectRegex)
      if (matches && matches.length > 0) {
        const extracted: SpawnableShape[] = []
        for (const m of matches) {
          try {
            const cleanedObj = m.replace(/,\s*([\]}])/g, '$1')
            const obj = JSON.parse(cleanedObj)
            if (isValidShape(obj)) extracted.push(obj)
          } catch {
            // ignore
          }
        }
        if (extracted.length > 0) return extracted
      }
    } catch {
      // ignore
    }
  }

  return null
}

/**
 * Extract spawnable canvas shapes from model output.
 */
export function parseCanvasActions(output: string): SpawnableShape[] {
  if (!output || typeof output !== 'string') return []

  // Try matching ```canvas [...] ``` or ```json [...] ```
  const canvasBlockRegex = /```(?:canvas|json)?\s*\n?([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = canvasBlockRegex.exec(output)) !== null) {
    const parsed = tryParseShapesJson(match[1])
    if (parsed && parsed.length > 0) return parsed
  }

  // Fallback: search for any JSON array with shapes directly in text
  const rawArrayMatch = output.match(/\[\s*\{\s*"type"\s*:\s*"(?:task|note|timer)"[\s\S]*?\}\s*\]/)
  if (rawArrayMatch) {
    const parsed = tryParseShapesJson(rawArrayMatch[0])
    if (parsed && parsed.length > 0) return parsed
  }

  return []
}

/**
 * Splits model output into alternating text segments and canvas schema segments.
 * This allows replacing literal ```canvas [...] ``` JSON blocks with interactive UI components.
 */
export function parseOutputSegments(output: string): OutputSegment[] {
  if (!output) return []

  const segments: OutputSegment[] = []
  const codeBlockRegex = /```(?:canvas|json)?\s*\n?([\s\S]*?)```/gi

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(output)) !== null) {
    const textBefore = output.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      segments.push({ type: 'text', content: textBefore })
    }

    const insideCode = match[1].trim()
    const parsedShapes = tryParseShapesJson(insideCode)

    if (parsedShapes && parsedShapes.length > 0) {
      segments.push({
        type: 'canvas',
        actions: parsedShapes,
        raw: match[0],
      })
    } else {
      // Non-canvas code block, keep as text
      segments.push({ type: 'text', content: match[0] })
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining tail text
  const remaining = output.slice(lastIndex)
  if (remaining) {
    // Check if remaining contains an unfinished ```canvas block during streaming
    const unfinishedMatch = remaining.match(/(```(?:canvas|json)?\s*\n?[\s\S]*)$/i)
    if (unfinishedMatch && unfinishedMatch.index !== undefined) {
      const beforeUnfinished = remaining.slice(0, unfinishedMatch.index)
      if (beforeUnfinished.trim()) {
        segments.push({ type: 'text', content: beforeUnfinished })
      }
      const partialShapes = tryParseShapesJson(unfinishedMatch[1])
      if (partialShapes && partialShapes.length > 0) {
        segments.push({
          type: 'canvas',
          actions: partialShapes,
          raw: unfinishedMatch[1],
        })
      } else {
        segments.push({
          type: 'streaming-canvas',
          raw: unfinishedMatch[1],
        })
      }
    } else {
      if (remaining.trim()) {
        segments.push({ type: 'text', content: remaining })
      }
    }
  }

  return segments
}

/**
 * Spawns a single shape on the canvas with full default props and arrow connection.
 */
export function spawnSingleShapeOnCanvas(
  editor: Editor,
  action: SpawnableShape,
  sourceShape?: TLShape | null,
  offsetIndex: number = 0
): TLShapeId | null {
  if (!editor || !action) return null

  const center = editor.getViewportPageBounds().center
  const startX = sourceShape
    ? sourceShape.x + ((sourceShape.props as any)?.w || 260) + 60
    : center.x - 130
  const startY = sourceShape ? sourceShape.y : center.y - 42

  const CARD_W = 260
  const CARD_H = 84
  const GAP_X = 40
  const GAP_Y = 24

  const col = Math.floor(offsetIndex / 3)
  const row = offsetIndex % 3
  const x = startX + col * (CARD_W + GAP_X)
  const y = startY + row * (CARD_H + GAP_Y)

  const id = createShapeId()

  try {
    if (action.type === 'task') {
      const defaultTaskProps =
        (editor.getShapeUtil('focus-task') as any)?.getDefaultProps() || {}
      editor.createShape({
        id,
        type: 'focus-task',
        x,
        y,
        props: {
          ...defaultTaskProps,
          w: CARD_W,
          h: CARD_H,
          title: action.title || action.text || 'New Task',
          priority: typeof action.priority === 'number' ? action.priority : 3,
          status: 'open',
          agentModel: (sourceShape?.props as any)?.agentModel,
        },
      })

      // Connect with arrow from source shape if present
      if (sourceShape) {
        try {
          const sourceW = (sourceShape.props as any)?.w || 200
          const sourceH = (sourceShape.props as any)?.h || 80
          const arrowStartX = sourceShape.x + sourceW
          const arrowStartY = sourceShape.y + sourceH / 2
          const dx = x - arrowStartX
          const dy = y + CARD_H / 2 - arrowStartY

          const arrowId = createShapeId()
          const defaultArrowProps =
            (editor.getShapeUtil('arrow') as any)?.getDefaultProps() || {}

          editor.createShape({
            id: arrowId,
            type: 'arrow',
            x: arrowStartX,
            y: arrowStartY,
            props: {
              ...defaultArrowProps,
              start: { x: 0, y: 0 },
              end: { x: dx, y: dy },
              color: 'grey',
              size: 's',
            },
          })

          try {
            editor.createBinding({
              type: 'arrow',
              fromId: arrowId,
              toId: sourceShape.id,
              props: {
                terminal: 'start',
                normalizedAnchor: { x: 1, y: 0.5 },
                isExact: false,
                isPrecise: false,
              },
            })
            editor.createBinding({
              type: 'arrow',
              fromId: arrowId,
              toId: id,
              props: {
                terminal: 'end',
                normalizedAnchor: { x: 0, y: 0.5 },
                isExact: false,
                isPrecise: false,
              },
            })
          } catch {
            // bindings optional
          }
        } catch {
          // arrow optional
        }
      }
    } else if (action.type === 'note') {
      const defaultNoteProps =
        (editor.getShapeUtil('note') as any)?.getDefaultProps() || {}
      const noteText = action.text || action.title || 'Note'
      const validColors = [
        'yellow',
        'blue',
        'green',
        'pink',
        'black',
        'grey',
        'red',
        'violet',
      ]
      const noteColor = validColors.includes(action.color as string)
        ? (action.color as any)
        : 'yellow'

      editor.createShape({
        id,
        type: 'note',
        x,
        y,
        props: {
          ...defaultNoteProps,
          color: noteColor,
          richText: toRichText
            ? toRichText(noteText)
            : {
                type: 'doc',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: noteText }],
                  },
                ],
              },
        },
      })
    } else if (action.type === 'timer') {
      const defaultTimerProps =
        (editor.getShapeUtil('focus-timer') as any)?.getDefaultProps() || {}
      editor.createShape({
        id,
        type: 'focus-timer',
        x,
        y,
        props: {
          ...defaultTimerProps,
          w: 140,
          h: 160,
          durationPreset: action.minutes || 15,
          running: false,
          endAt: null,
          linkedTaskId: '',
          sessionStartedAt: null,
        },
      })
    }

    editor.select(id)
    return id
  } catch (err) {
    console.error('Failed to spawn shape:', err)
    return null
  }
}

/**
 * Spawn shapes directly onto the tldraw infinite canvas connected to the source card.
 */
export function spawnShapesOnCanvas(
  editor: Editor,
  sourceShape: TLShape | null | undefined,
  actions: SpawnableShape[]
): number {
  if (!editor || !actions.length) return 0

  const createdIds: TLShapeId[] = []

  actions.forEach((action, index) => {
    const id = spawnSingleShapeOnCanvas(editor, action, sourceShape, index)
    if (id) {
      createdIds.push(id)
    }
  })

  if (createdIds.length > 0) {
    editor.setSelectedShapes(createdIds)
    // Smoothly pan camera to frame the newly created shapes
    try {
      const bounds = editor.getSelectionPageBounds()
      if (bounds) {
        editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 120 })
      }
    } catch {
      // zoom optional
    }
  }

  return createdIds.length
}

/**
 * Spawn sequential workflow tasks directly inside a Project Frame connected by arrows.
 */
export function spawnWorkflowForProject(
  editor: Editor,
  projectShape: TLProjectFrameShape,
  actions: SpawnableShape[]
): number {
  const taskActions = actions.filter((a) => a.type === 'task')
  if (!editor || !taskActions.length) return 0

  const defaultTaskProps =
    (editor.getShapeUtil('focus-task') as any)?.getDefaultProps() || {}
  const defaultArrowProps =
    (editor.getShapeUtil('arrow') as any)?.getDefaultProps() || {}

  const CARD_W = 240
  const CARD_H = 84
  const GAP_X = 60
  const GAP_Y = 32
  const startX = projectShape.x + 36
  const startY = projectShape.y + 64

  const createdTaskIds: TLShapeId[] = []

  taskActions.forEach((action, index) => {
    const col = index % 2
    const row = Math.floor(index / 2)
    const x = startX + col * (CARD_W + GAP_X)
    const y = startY + row * (CARD_H + GAP_Y)

    const id = createShapeId()
    try {
      editor.createShape({
        id,
        type: 'focus-task',
        x,
        y,
        parentId: projectShape.id,
        props: {
          ...defaultTaskProps,
          w: CARD_W,
          h: CARD_H,
          title: action.title || action.text || 'New Subtask',
          priority: typeof action.priority === 'number' ? action.priority : 3,
          status: 'open',
        },
      })
      createdTaskIds.push(id)

      // Connect previous task to this task with an arrow
      if (index > 0) {
        const prevId = createdTaskIds[index - 1]
        const prevShape = editor.getShape(prevId)
        if (prevShape) {
          const arrowStartX = prevShape.x + CARD_W
          const arrowStartY = prevShape.y + CARD_H / 2
          const arrowEndX = x
          const arrowEndY = y + CARD_H / 2

          const arrowId = createShapeId()
          editor.createShape({
            id: arrowId,
            type: 'arrow',
            x: arrowStartX,
            y: arrowStartY,
            parentId: projectShape.id,
            props: {
              ...defaultArrowProps,
              start: { x: 0, y: 0 },
              end: { x: arrowEndX - arrowStartX, y: arrowEndY - arrowStartY },
              color: 'grey',
              size: 's',
            },
          })

          try {
            editor.createBinding({
              type: 'arrow',
              fromId: arrowId,
              toId: prevId,
              props: {
                terminal: 'start',
                normalizedAnchor: { x: 1, y: 0.5 },
                isExact: false,
                isPrecise: false,
              },
            })
            editor.createBinding({
              type: 'arrow',
              fromId: arrowId,
              toId: id,
              props: {
                terminal: 'end',
                normalizedAnchor: { x: 0, y: 0.5 },
                isExact: false,
                isPrecise: false,
              },
            })
          } catch {
            // bindings optional
          }
        }
      }
    } catch (err) {
      console.error('Failed to spawn project task:', err)
    }
  })

  // Auto-expand frame height if tasks overflow
  const requiredRows = Math.ceil(taskActions.length / 2)
  const neededH = 80 + requiredRows * (CARD_H + GAP_Y)
  if (projectShape.props.h < neededH) {
    editor.updateShape({
      id: projectShape.id,
      type: 'project-frame',
      props: {
        ...projectShape.props,
        h: neededH + 30,
      },
    })
  }

  if (createdTaskIds.length > 0) {
    editor.setSelectedShapes(createdTaskIds)
    try {
      const bounds = editor.getShapePageBounds(projectShape.id)
      if (bounds) {
        editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 80 })
      }
    } catch {
      // zoom optional
    }
  }

  return createdTaskIds.length
}

