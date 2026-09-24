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
 * Normalizes an arbitrary item from model JSON into a valid SpawnableShape.
 * Defaults tasks with a title to type: 'task'.
 */
export function normalizeShapeItem(item: any): SpawnableShape | null {
  if (!item || typeof item !== 'object') return null
  if (item.type === 'task' || item.type === 'note' || item.type === 'timer') {
    return item as SpawnableShape
  }
  // If item has title or text or task or name, infer type task
  if (item.title || item.task || item.name) {
    return {
      type: 'task',
      title: String(item.title || item.task || item.name),
      priority: typeof item.priority === 'number' ? item.priority : 3,
      text: item.notes || item.text || item.description,
      minutes: typeof item.minutes === 'number' ? item.minutes : undefined,
    }
  }
  if (item.text && item.color) {
    return {
      type: 'note',
      text: String(item.text),
      color: item.color,
    }
  }
  if (typeof item.minutes === 'number' || item.timer) {
    return {
      type: 'timer',
      minutes: typeof item.minutes === 'number' ? item.minutes : 25,
    }
  }
  return null
}

/**
 * Attempts to parse a JSON array or object of shapes, cleaning trailing commas and relaxed syntax.
 */
export function tryParseShapesJson(raw: string): SpawnableShape[] | null {
  if (!raw) return null

  // 1. First try parsing direct or enclosed JSON array
  const firstBracket = raw.indexOf('[')
  const lastBracket = raw.lastIndexOf(']')

  if (firstBracket !== -1) {
    const jsonSubstring =
      lastBracket > firstBracket
        ? raw.slice(firstBracket, lastBracket + 1)
        : raw.slice(firstBracket) + ']'

    try {
      // Clean trailing commas before } or ]
      const cleaned = jsonSubstring.replace(/,\s*([\]}])/g, '$1')
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        const valid = parsed
          .map(normalizeShapeItem)
          .filter((s): s is SpawnableShape => s !== null)
        if (valid.length > 0) return valid
      }
    } catch {
      // ignore, fall through
    }
  }

  // 2. Try parsing a JSON object like { "tasks": [...] } or { "elements": [...] } or { "shapes": [...] }
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const cleaned = raw
        .slice(firstBrace, lastBrace + 1)
        .replace(/,\s*([\]}])/g, '$1')
      const parsed = JSON.parse(cleaned)
      if (parsed && typeof parsed === 'object') {
        const candidateArray =
          parsed.tasks ||
          parsed.elements ||
          parsed.shapes ||
          parsed.actions ||
          parsed.items
        if (Array.isArray(candidateArray)) {
          const valid = candidateArray
            .map(normalizeShapeItem)
            .filter((s): s is SpawnableShape => s !== null)
          if (valid.length > 0) return valid
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. Resilient fallback: extract individual shape objects with regex
  try {
    const objectRegex = /\{\s*"(?:type|title|text|task|name)"[\s\S]*?\}/g
    const matches = raw.match(objectRegex)
    if (matches && matches.length > 0) {
      const extracted: SpawnableShape[] = []
      for (const m of matches) {
        try {
          const cleanedObj = m.replace(/,\s*([\]}])/g, '$1')
          const obj = JSON.parse(cleanedObj)
          const norm = normalizeShapeItem(obj)
          if (norm) extracted.push(norm)
        } catch {
          // ignore
        }
      }
      if (extracted.length > 0) return extracted
    }
  } catch {
    // ignore
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
  const rawArrayMatch = output.match(/\[\s*\{\s*"(?:type|title|task|name)"[\s\S]*?\}\s*\]/)
  if (rawArrayMatch) {
    const parsed = tryParseShapesJson(rawArrayMatch[0])
    if (parsed && parsed.length > 0) return parsed
  }

  // Fallback: search for any JSON object with tasks or elements
  const rawObjectMatch = output.match(/\{\s*"(?:tasks|elements|shapes|actions|items)"\s*:\s*\[[\s\S]*?\]\s*\}/)
  if (rawObjectMatch) {
    const parsed = tryParseShapesJson(rawObjectMatch[0])
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

export interface Box2D {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Returns true if box `a` overlaps with any box in `bList` with given padding.
 */
export function isColliding(a: Box2D, bList: Box2D[], padding = 16): boolean {
  for (const b of bList) {
    if (
      a.x < b.x + b.w + padding &&
      a.x + a.w + padding > b.x &&
      a.y < b.y + b.h + padding &&
      a.y + a.h + padding > b.y
    ) {
      return true
    }
  }
  return false
}

/**
 * Get natural dimensions for a spawnable shape type.
 */
export function getShapeDimensions(action: SpawnableShape): { w: number; h: number } {
  if (action.type === 'note') {
    return { w: 200, h: 200 }
  }
  if (action.type === 'timer') {
    return { w: 140, h: 160 }
  }
  return { w: 260, h: 84 }
}

/**
 * Collect bounding boxes of all existing shapes on the current page to prevent collisions.
 */
export function getExistingPageBoxes(editor: Editor, excludeIds: Set<TLShapeId>): Box2D[] {
  const boxes: Box2D[] = []
  const pageShapes = editor.getCurrentPageShapes()
  for (const s of pageShapes) {
    if (excludeIds.has(s.id) || s.type === 'arrow') continue
    const bounds = editor.getShapePageBounds(s.id)
    if (bounds) {
      boxes.push({
        x: bounds.minX,
        y: bounds.minY,
        w: bounds.w,
        h: bounds.h,
      })
    }
  }
  return boxes
}

/**
 * Spawns a single shape on the canvas with collision avoidance and clean connection.
 */
export function spawnSingleShapeOnCanvas(
  editor: Editor,
  action: SpawnableShape,
  sourceShape?: TLShape | null,
  offsetIndex: number = 0
): TLShapeId | null {
  if (!editor || !action) return null

  const center = editor.getViewportPageBounds().center
  const sourceBounds = sourceShape ? editor.getShapePageBounds(sourceShape.id) : null
  const { w: shapeW, h: shapeH } = getShapeDimensions(action)

  const startX = sourceBounds ? sourceBounds.maxX + 60 : center.x - shapeW / 2
  const startY = sourceBounds ? sourceBounds.minY : center.y - shapeH / 2

  const excludeIds = new Set<TLShapeId>(sourceShape ? [sourceShape.id] : [])
  const existingBoxes = getExistingPageBoxes(editor, excludeIds)

  let x = startX
  let y = startY + offsetIndex * (shapeH + 24)
  let candidate: Box2D = { x, y, w: shapeW, h: shapeH }

  // Step down or to next column until non-colliding
  while (isColliding(candidate, existingBoxes, 16)) {
    candidate.y += 28
    if (candidate.y - startY > 600) {
      candidate.x += 300
      candidate.y = startY
    }
  }

  x = candidate.x
  y = candidate.y

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
          w: shapeW,
          h: shapeH,
          title: action.title || action.text || 'New Task',
          priority: typeof action.priority === 'number' ? action.priority : 3,
          status: 'open',
          agentModel: (sourceShape?.props as any)?.agentModel,
        },
      })

      // Connect with arrow from source shape if nearby and path is unobstructed
      if (sourceShape && sourceBounds && x === startX) {
        try {
          const arrowStartX = sourceBounds.maxX
          const arrowStartY = sourceBounds.minY + sourceBounds.h / 2
          const dx = x - arrowStartX
          const dy = y + shapeH / 2 - arrowStartY

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
 * Spawn shapes directly onto the tldraw infinite canvas with anti-collision placement
 * and clean arrow chaining between sequential cards.
 */
export function spawnShapesOnCanvas(
  editor: Editor,
  sourceShape: TLShape | null | undefined,
  actions: SpawnableShape[]
): number {
  if (!editor || !actions.length) return 0

  const center = editor.getViewportPageBounds().center
  const sourceBounds = sourceShape ? editor.getShapePageBounds(sourceShape.id) : null

  const excludeIds = new Set<TLShapeId>(sourceShape ? [sourceShape.id] : [])
  const occupiedBoxes = getExistingPageBoxes(editor, excludeIds)

  const defaultTaskProps =
    (editor.getShapeUtil('focus-task') as any)?.getDefaultProps() || {}
  const defaultNoteProps =
    (editor.getShapeUtil('note') as any)?.getDefaultProps() || {}
  const defaultTimerProps =
    (editor.getShapeUtil('focus-timer') as any)?.getDefaultProps() || {}
  const defaultArrowProps =
    (editor.getShapeUtil('arrow') as any)?.getDefaultProps() || {}

  const startX = sourceBounds ? sourceBounds.maxX + 60 : center.x - 130
  const startY = sourceBounds ? sourceBounds.minY : center.y - 42

  let curX = startX
  let curY = startY

  const createdIds: TLShapeId[] = []
  const createdTaskIds: TLShapeId[] = []

  actions.forEach((action) => {
    const { w: shapeW, h: shapeH } = getShapeDimensions(action)

    let candidate: Box2D = { x: curX, y: curY, w: shapeW, h: shapeH }
    while (isColliding(candidate, occupiedBoxes, 16)) {
      candidate.y += 24
      if (candidate.y - startY > 600) {
        curX += 300
        candidate.x = curX
        candidate.y = startY
      }
    }

    const finalX = candidate.x
    const finalY = candidate.y
    occupiedBoxes.push({ ...candidate })
    curY = finalY + shapeH + 24

    const id = createShapeId()
    try {
      if (action.type === 'task') {
        editor.createShape({
          id,
          type: 'focus-task',
          x: finalX,
          y: finalY,
          props: {
            ...defaultTaskProps,
            w: shapeW,
            h: shapeH,
            title: action.title || action.text || 'New Task',
            priority: typeof action.priority === 'number' ? action.priority : 3,
            status: 'open',
            agentModel: (sourceShape?.props as any)?.agentModel,
          },
        })
        createdTaskIds.push(id)
        createdIds.push(id)
      } else if (action.type === 'note') {
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
          x: finalX,
          y: finalY,
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
        createdIds.push(id)
      } else if (action.type === 'timer') {
        editor.createShape({
          id,
          type: 'focus-timer',
          x: finalX,
          y: finalY,
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
        createdIds.push(id)
      }
    } catch (err) {
      console.error('Failed to spawn shape on canvas:', err)
    }
  })

  // Arrows:
  // 1. Connect sourceShape to the first task
  if (sourceShape && sourceBounds && createdTaskIds.length > 0) {
    const firstTask = editor.getShape(createdTaskIds[0])
    if (firstTask) {
      const arrowStartX = sourceBounds.maxX
      const arrowStartY = sourceBounds.minY + sourceBounds.h / 2
      const arrowEndX = firstTask.x
      const arrowEndY = firstTask.y + ((firstTask.props as any)?.h || 84) / 2

      const arrowId = createShapeId()
      editor.createShape({
        id: arrowId,
        type: 'arrow',
        x: arrowStartX,
        y: arrowStartY,
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
          toId: firstTask.id,
          props: {
            terminal: 'end',
            normalizedAnchor: { x: 0, y: 0.5 },
            isExact: false,
            isPrecise: false,
          },
        })
      } catch {}
    }
  }

  // 2. Connect sequential tasks cleanly with downward arrows (zero card crossing)
  for (let i = 1; i < createdTaskIds.length; i++) {
    const prevTask = editor.getShape(createdTaskIds[i - 1])
    const currTask = editor.getShape(createdTaskIds[i])
    if (prevTask && currTask) {
      const prevW = (prevTask.props as any)?.w || 260
      const prevH = (prevTask.props as any)?.h || 84
      const currW = (currTask.props as any)?.w || 260

      if (Math.abs(prevTask.x - currTask.x) < 20) {
        // Vertical downward arrow within same column
        const arrowStartX = prevTask.x + prevW / 2
        const arrowStartY = prevTask.y + prevH
        const arrowEndX = currTask.x + currW / 2
        const arrowEndY = currTask.y

        const arrowId = createShapeId()
        editor.createShape({
          id: arrowId,
          type: 'arrow',
          x: arrowStartX,
          y: arrowStartY,
          props: {
            ...defaultArrowProps,
            start: { x: 0, y: 0 },
            end: { x: 0, y: arrowEndY - arrowStartY },
            color: 'grey',
            size: 's',
          },
        })
        try {
          editor.createBinding({
            type: 'arrow',
            fromId: arrowId,
            toId: prevTask.id,
            props: {
              terminal: 'start',
              normalizedAnchor: { x: 0.5, y: 1 },
              isExact: false,
              isPrecise: false,
            },
          })
          editor.createBinding({
            type: 'arrow',
            fromId: arrowId,
            toId: currTask.id,
            props: {
              terminal: 'end',
              normalizedAnchor: { x: 0.5, y: 0 },
              isExact: false,
              isPrecise: false,
            },
          })
        } catch {}
      }
    }
  }

  if (createdIds.length > 0) {
    editor.setSelectedShapes(createdIds)
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
 * Find the project frame associated with a given shape (either the shape itself,
 * its parent, or a project frame containing its bounding box on the canvas).
 */
export function findContainingProjectFrame(
  editor: Editor,
  shape: TLShape | null | undefined
): TLProjectFrameShape | null {
  if (!editor || !shape) return null

  // 1. Direct project frame shape
  if (shape.type === 'project-frame') {
    return shape as TLProjectFrameShape
  }

  // 2. Child of a project frame
  if (shape.parentId) {
    const parent = editor.getShape(shape.parentId)
    if (parent && parent.type === 'project-frame') {
      return parent as TLProjectFrameShape
    }
  }

  // 3. Geometrically contained inside any project frame on the page
  const pageShapes = editor.getCurrentPageShapes()
  for (const s of pageShapes) {
    if (s.type === 'project-frame') {
      const pf = s as TLProjectFrameShape
      const frameX = pf.x
      const frameY = pf.y
      const frameR = frameX + pf.props.w
      const frameB = frameY + pf.props.h

      const pageBounds = editor.getShapePageBounds(shape.id)
      if (pageBounds) {
        if (
          pageBounds.minX >= frameX - 5 &&
          pageBounds.maxX <= frameR + 5 &&
          pageBounds.minY >= frameY - 5 &&
          pageBounds.maxY <= frameB + 5
        ) {
          return pf
        }
      } else if (
        shape.x >= frameX &&
        shape.x <= frameR &&
        shape.y >= frameY &&
        shape.y <= frameB
      ) {
        return pf
      }
    }
  }

  return null
}

/**
 * Spawn sequential workflow tasks directly inside a Project Frame connected by clean arrows
 * with collision avoidance and dynamic auto-expansion.
 */
export function spawnWorkflowForProject(
  editor: Editor,
  projectShape: TLProjectFrameShape,
  actions: SpawnableShape[]
): number {
  if (!editor || !actions.length) return 0

  const defaultTaskProps =
    (editor.getShapeUtil('focus-task') as any)?.getDefaultProps() || {}
  const defaultNoteProps =
    (editor.getShapeUtil('note') as any)?.getDefaultProps() || {}
  const defaultTimerProps =
    (editor.getShapeUtil('focus-timer') as any)?.getDefaultProps() || {}
  const defaultArrowProps =
    (editor.getShapeUtil('arrow') as any)?.getDefaultProps() || {}

  // 1. Gather all occupied local boxes in project frame
  const occupiedInFrame: Box2D[] = []
  const frameX = projectShape.x
  const frameY = projectShape.y
  const frameW = projectShape.props.w || 720
  const frameH = projectShape.props.h || 460
  const frameR = frameX + frameW
  const frameB = frameY + frameH

  const allShapes = editor.getCurrentPageShapes()
  for (const s of allShapes) {
    if (s.id === projectShape.id || s.type === 'arrow') continue
    if (s.parentId === projectShape.id) {
      occupiedInFrame.push({
        x: s.x,
        y: s.y,
        w: (s.props as any)?.w || 260,
        h: (s.props as any)?.h || 84,
      })
    } else {
      const bounds = editor.getShapePageBounds(s.id)
      if (bounds) {
        if (
          bounds.maxX >= frameX &&
          bounds.minX <= frameR &&
          bounds.maxY >= frameY &&
          bounds.minY <= frameB
        ) {
          occupiedInFrame.push({
            x: bounds.minX - frameX,
            y: bounds.minY - frameY,
            w: bounds.w,
            h: bounds.h,
          })
        }
      }
    }
  }

  // 2. Track column cursors (Col 0 starts at x = 36, Col 1 starts at x = 336)
  const COL_W = 260
  const GAP_X = 40
  const GAP_Y = 24
  let col0Y = 92
  let col1Y = 92

  for (const b of occupiedInFrame) {
    const bottom = b.y + b.h + GAP_Y
    if (b.x < 300) {
      if (bottom > col0Y) col0Y = bottom
    } else {
      if (bottom > col1Y) col1Y = bottom
    }
  }

  const createdIds: TLShapeId[] = []
  const createdTaskIds: TLShapeId[] = []

  actions.forEach((action) => {
    const { w: shapeW, h: shapeH } = getShapeDimensions(action)

    let colIndex = col0Y <= col1Y ? 0 : 1
    if (col0Y > 400 && col1Y <= 400) {
      colIndex = 1
    }

    const colX = colIndex === 0 ? 36 : 36 + COL_W + GAP_X
    let curY = colIndex === 0 ? col0Y : col1Y

    let candidate: Box2D = { x: colX, y: curY, w: shapeW, h: shapeH }
    while (isColliding(candidate, occupiedInFrame, 16)) {
      candidate.y += 24
    }

    const finalX = candidate.x
    const finalY = candidate.y
    occupiedInFrame.push({ ...candidate })

    if (colIndex === 0) {
      col0Y = finalY + shapeH + GAP_Y
    } else {
      col1Y = finalY + shapeH + GAP_Y
    }

    const id = createShapeId()
    try {
      if (action.type === 'task') {
        editor.createShape({
          id,
          type: 'focus-task',
          x: finalX,
          y: finalY,
          parentId: projectShape.id,
          props: {
            ...defaultTaskProps,
            w: shapeW,
            h: shapeH,
            title: action.title || action.text || 'New Subtask',
            priority: typeof action.priority === 'number' ? action.priority : 3,
            status: 'open',
          },
        })
        createdTaskIds.push(id)
        createdIds.push(id)
      } else if (action.type === 'note') {
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
          x: finalX,
          y: finalY,
          parentId: projectShape.id,
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
        createdIds.push(id)
      } else if (action.type === 'timer') {
        editor.createShape({
          id,
          type: 'focus-timer',
          x: finalX,
          y: finalY,
          parentId: projectShape.id,
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
        createdIds.push(id)
      }
    } catch (err) {
      console.error('Failed to spawn project task:', err)
    }
  })

  // Connect sequential tasks cleanly:
  // - Downward arrows between tasks in the same column
  // - Forward horizontal arrows when transitioning from Col 0 to Col 1
  for (let i = 1; i < createdTaskIds.length; i++) {
    const prevTask = editor.getShape(createdTaskIds[i - 1])
    const currTask = editor.getShape(createdTaskIds[i])
    if (prevTask && currTask) {
      const prevW = (prevTask.props as any)?.w || COL_W
      const prevH = (prevTask.props as any)?.h || 84
      const currW = (currTask.props as any)?.w || COL_W

      if (Math.abs(prevTask.x - currTask.x) < 20) {
        // Vertical downward arrow within same column
        const arrowStartX = prevTask.x + prevW / 2
        const arrowStartY = prevTask.y + prevH
        const arrowEndX = currTask.x + currW / 2
        const arrowEndY = currTask.y

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
            end: { x: 0, y: arrowEndY - arrowStartY },
            color: 'grey',
            size: 's',
          },
        })
        try {
          editor.createBinding({
            type: 'arrow',
            fromId: arrowId,
            toId: prevTask.id,
            props: {
              terminal: 'start',
              normalizedAnchor: { x: 0.5, y: 1 },
              isExact: false,
              isPrecise: false,
            },
          })
          editor.createBinding({
            type: 'arrow',
            fromId: arrowId,
            toId: currTask.id,
            props: {
              terminal: 'end',
              normalizedAnchor: { x: 0.5, y: 0 },
              isExact: false,
              isPrecise: false,
            },
          })
        } catch {}
      } else if (currTask.x > prevTask.x) {
        // Forward horizontal arrow from left column to right column
        const arrowStartX = prevTask.x + prevW
        const arrowStartY = prevTask.y + prevH / 2
        const arrowEndX = currTask.x
        const arrowEndY = currTask.y + ((currTask.props as any)?.h || 84) / 2

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
            toId: prevTask.id,
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
            toId: currTask.id,
            props: {
              terminal: 'end',
              normalizedAnchor: { x: 0, y: 0.5 },
              isExact: false,
              isPrecise: false,
            },
          })
        } catch {}
      }
    }
  }

  // Auto-expand frame to fit all items with padding
  let maxX = 0
  let maxY = 0
  for (const b of occupiedInFrame) {
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }

  const currentW = projectShape.props.w || 720
  const currentH = projectShape.props.h || 460
  const newW = Math.max(currentW, maxX + 36)
  const newH = Math.max(currentH, maxY + 36)

  if (newW !== currentW || newH !== currentH) {
    editor.updateShape({
      id: projectShape.id,
      type: 'project-frame',
      props: {
        ...projectShape.props,
        w: newW,
        h: newH,
      },
    })
  }

  if (createdIds.length > 0) {
    editor.setSelectedShapes(createdIds)
    try {
      const bounds = editor.getShapePageBounds(projectShape.id)
      if (bounds) {
        editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 80 })
      }
    } catch {
      // zoom optional
    }
  }

  return createdIds.length
}

