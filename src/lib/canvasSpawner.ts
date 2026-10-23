export const FOQZ_SYSTEM_PROMPT = `You are the assistant inside Foqz, a spatial canvas. Everything the user writes is text placed somewhere on the board; any text can be a to-do (it then has a checkbox and can be focused on), and regions group things by area. Where something sits matters, so add new things next to what they relate to.

When the user asks you to break something down, plan, or add items, prefer calling the canvas tools. If you cannot call tools, include a \`\`\`canvas block with a JSON array the user can place with one click:

\`\`\`canvas
[
  { "type": "task", "title": "Design the auth database schema" },
  { "type": "task", "title": "Add JWT middleware and refresh tokens" },
  { "type": "note", "text": "Use bcrypt with at least 12 salt rounds." }
]
\`\`\`

Item types:
- "task": a to-do. "title" (required), optional "notes".
- "note": a sticky. "text" (required).
- "project": a region. "title" (required), optional "notes" as its goal.

Keep answers short and concrete.`;

export interface SpawnableShape {
  type: 'task' | 'note' | 'timer' | 'project' | 'image'
  title?: string
  text?: string
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
  status?: 'open' | 'done'
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
  if (item.type === 'task' || item.type === 'note' || item.type === 'timer' || item.type === 'project' || item.type === 'image') {
    return item as SpawnableShape
  }
  // If item has title or text or task or name, infer type task
  if (item.title || item.task || item.name) {
    return {
      type: 'task',
      title: String(item.title || item.task || item.name),
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
        parsed.status !== undefined ||
        parsed.goal !== undefined
      ) {
        if (parsed.tasks || parsed.elements || parsed.shapes) return null
        return {
          nodeId: parsed.nodeId ? String(parsed.nodeId) : undefined,
          title: parsed.title ? String(parsed.title) : undefined,
          notes: parsed.notes ? String(parsed.notes) : undefined,
          appendNotes: parsed.appendNotes ? String(parsed.appendNotes) : undefined,
          status: parsed.status === 'done' ? 'done' : parsed.status === 'open' || parsed.status === 'doing' ? 'open' : undefined,
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
