export const FOQZ_SYSTEM_PROMPT = `You are an AI assistant and autonomous agent embedded inside Foqz, an infinite-canvas desktop command center.
You have FULL CAPABILITY to create and spawn cards, tasks, sketch boxes, and projects directly on the user's canvas.

Whenever the user asks you to:
- Break down a goal, plan, or project into subtasks
- Create or spawn tasks/cards on the canvas
- Add notes, checklists, tips, or documentation
- Set up a workflow

You MUST explain your reasoning clearly AND include a \`\`\`canvas block with a JSON array of shapes to spawn on the board.

Format:
\`\`\`canvas
[
  { "type": "task", "title": "Design authentication database schema", "priority": 1 },
  { "type": "task", "title": "Implement JWT middleware and refresh tokens", "priority": 2 },
  { "type": "task", "title": "Create frontend login & register forms", "priority": 3 },
  { "type": "note", "text": "Security tip: Use bcrypt with salt rounds >= 12 and secure httpOnly cookies.", "color": "yellow" }
]
\`\`\`

Supported shape types:
- "task": Executable task card. Properties: "title" (string, required), "priority" (number: 1=Urgent, 2=High, 3=Normal, 4=Low).
- "note": Sticky note. Properties: "text" (string, required), "color" ("yellow" | "blue" | "green" | "pink").
- "project": Project frame milestone. Properties: "title" (string, required), "notes" (goal string).

Always output valid JSON inside the \`\`\`canvas block when creating items. Never tell the user you cannot create cards or canvas elements—you DO have this direct ability through the Foqz canvas engine!`;

export interface SpawnableShape {
  type: 'task' | 'note' | 'timer' | 'project' | 'image'
  title?: string
  text?: string
  priority?: number
  color?: 'yellow' | 'blue' | 'green' | 'pink' | 'red' | 'black' | 'grey' | 'violet'
  minutes?: number
  notes?: string
  src?: string
  alt?: string
}

export interface ProposedNodeUpdate {
  nodeId?: string
  title?: string
  notes?: string
  appendNotes?: string
  priority?: number
  status?: 'open' | 'doing' | 'done'
  paper?: 'cream' | 'fog' | 'bloom' | 'sage'
  goal?: string
}

export type OutputSegment =
  | { type: 'text'; content: string }
  | { type: 'canvas'; actions: SpawnableShape[]; raw: string }
  | { type: 'streaming-canvas'; raw: string }
  | { type: 'proposed-update'; update: ProposedNodeUpdate; raw: string }

export function isValidShape(item: any): item is SpawnableShape {
  return (
    item &&
    typeof item === 'object' &&
    (item.type === 'task' || item.type === 'note' || item.type === 'timer' || item.type === 'project' || item.type === 'image')
  )
}

/**
 * Normalizes an arbitrary item from model JSON into a valid SpawnableShape.
 * Defaults tasks with a title to type: 'task'.
 */
export function normalizeShapeItem(item: any): SpawnableShape | null {
  if (!item || typeof item !== 'object') return null
  if (item.type === 'task' || item.type === 'note' || item.type === 'timer' || item.type === 'project') {
    return item as SpawnableShape
  }
  // If item has title or text or task or name, infer type task
  if (item.title || item.task || item.name) {
    return {
      type: 'task',
      title: String(item.title || item.task || item.name),
      priority: typeof item.priority === 'number' ? item.priority : 3,
      text: item.notes || item.text || item.description,
      notes: item.notes || item.text || item.description,
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
 * Attempts to parse a JSON object proposing updates to an existing node.
 */
export function tryParseNodeUpdateJson(raw: string): ProposedNodeUpdate | null {
  if (!raw) return null
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) return null

  try {
    const cleaned = raw.slice(firstBrace, lastBrace + 1).replace(/,\s*([\]}])/g, '$1')
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (
        parsed.title !== undefined ||
        parsed.notes !== undefined ||
        parsed.appendNotes !== undefined ||
        parsed.priority !== undefined ||
        parsed.status !== undefined ||
        parsed.paper !== undefined ||
        parsed.goal !== undefined
      ) {
        if (parsed.tasks || parsed.elements || parsed.shapes) return null
        return {
          nodeId: parsed.nodeId ? String(parsed.nodeId) : undefined,
          title: parsed.title ? String(parsed.title) : undefined,
          notes: parsed.notes ? String(parsed.notes) : undefined,
          appendNotes: parsed.appendNotes ? String(parsed.appendNotes) : undefined,
          priority: typeof parsed.priority === 'number' ? parsed.priority : undefined,
          status: parsed.status,
          paper: parsed.paper,
          goal: parsed.goal ? String(parsed.goal) : undefined,
        }
      }
    }
  } catch {}
  return null
}

/**
 * Splits model output into alternating text segments, canvas schema segments, and proposed update segments.
 * This allows replacing literal ```canvas [...] ``` and ```update_node {...}``` blocks with interactive UI components.
 */
export function parseOutputSegments(output: string): OutputSegment[] {
  if (!output) return []

  const segments: OutputSegment[] = []
  const codeBlockRegex = /```(?:canvas|json|update_node|diff)?\s*\n?([\s\S]*?)```/gi

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
      const parsedUpdate = tryParseNodeUpdateJson(insideCode)
      if (parsedUpdate) {
        segments.push({
          type: 'proposed-update',
          update: parsedUpdate,
          raw: match[0],
        })
      } else {
        // Non-canvas / non-update code block, keep as text
        segments.push({ type: 'text', content: match[0] })
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining tail text
  const remaining = output.slice(lastIndex)
  if (remaining) {
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
