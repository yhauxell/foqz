import type { McpToolCallResult } from './mcpTypes'
import type { AiChatMessage } from './aiProvider'
import type { AgentLoopResult, AgentToolCallEvent, RunAgentLoopOptions } from './mcpAgentLoop'

/**
 * Local Claude Code as a canvas AI provider. Electron main runs `claude -p --output-format
 * stream-json` (electron/claudeCode.cjs) and forwards each output line; this file turns those
 * lines into chat text and tool-call cards. Claude Code runs its own tool loop and reaches the
 * canvas through the embedded Foqz MCP server, so nothing here executes tools.
 */

export interface ClaudeCodeDetectResult {
  ok: boolean
  path?: string
  version?: string
  error?: string
  /** True when the Foqz MCP server is running, so Claude Code can edit the canvas. */
  canvasTools: boolean
}

export type ClaudeCodeEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; toolUseId: string; isError: boolean; text: string }
  | { type: 'result'; isError: boolean; text: string }

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (c && typeof c === 'object' && typeof (c as any).text === 'string' ? (c as any).text : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Parses one stream-json line. Only the main conversation counts: events from subagents carry a
 * parent_tool_use_id and are skipped. Assistant text comes from the partial deltas, so the full
 * `assistant` message only contributes its tool calls.
 */
export function parseClaudeCodeLine(line: string): ClaudeCodeEvent[] {
  let msg: any
  try {
    msg = JSON.parse(line)
  } catch {
    return []
  }
  if (!msg || typeof msg !== 'object' || msg.parent_tool_use_id) return []

  if (msg.type === 'stream_event') {
    const ev = msg.event
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
      return [{ type: 'text', text: ev.delta.text }]
    }
    return []
  }

  if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
    return msg.message.content
      .filter((c: any) => c?.type === 'tool_use' && typeof c.name === 'string')
      .map((c: any) => ({ type: 'tool_use', id: String(c.id ?? ''), name: c.name, input: c.input ?? {} }))
  }

  if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
    return msg.message.content
      .filter((c: any) => c?.type === 'tool_result')
      .map((c: any) => ({
        type: 'tool_result',
        toolUseId: String(c.tool_use_id ?? ''),
        isError: c.is_error === true,
        text: contentText(c.content),
      }))
  }

  if (msg.type === 'result') {
    return [{ type: 'result', isError: msg.is_error === true, text: typeof msg.result === 'string' ? msg.result : '' }]
  }
  return []
}

/** `mcp__foqz__update_node` → server `foqz`, tool `update_node`; built-ins have no server. */
export function splitClaudeToolName(name: string): { serverName?: string; toolName: string } {
  const m = name.match(/^mcp__(.+?)__(.+)$/)
  return m ? { serverName: m[1], toolName: m[2] } : { toolName: name }
}

/** Claude Code takes one prompt, so earlier turns and the canvas context are written into it. */
export function buildClaudeCodePrompt(options: Pick<RunAgentLoopOptions, 'userPrompt' | 'canvasContext' | 'conversationHistory'>): string {
  const parts: string[] = []
  // The chat passes the new user message as the last history entry too; it goes at the end.
  const history = (options.conversationHistory || []).filter((m) => m.role === 'user' || m.role === 'assistant')
  const earlier = history.length && history[history.length - 1].content === options.userPrompt ? history.slice(0, -1) : history
  if (earlier.length) {
    parts.push(
      'Conversation so far:\n' +
        earlier.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n'),
    )
  }
  if (options.canvasContext) parts.push(options.canvasContext)
  parts.push(`User request: ${options.userPrompt}`)
  return parts.join('\n\n')
}

const CANVAS_TOOLS_NOTE = `You are running inside Foqz, a spatial canvas app. Its canvas tools are available as the "foqz" MCP server (mcp__foqz__*): use them to read and change the board. Reply in short markdown.`

/** Runs one chat turn through the local Claude Code CLI. Same contract as runAgentLoop. */
export async function runClaudeCodeAgent(options: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const api = typeof window !== 'undefined' ? window.focusStore?.claudeCode : undefined
  if (!api) {
    return { success: false, finalText: '', steps: 0, history: [], executedTools: [], error: 'Claude Code runs only in the Foqz desktop app.' }
  }

  const requestId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const prompt = buildClaudeCodePrompt(options)
  const systemPrompt = [CANVAS_TOOLS_NOTE, options.systemPrompt].filter(Boolean).join('\n\n')
  const executedTools: AgentToolCallEvent[] = []
  const pendingTools = new Map<string, { event: AgentToolCallEvent; startedAt: number }>()
  let streamed = ''
  let result: { isError: boolean; text: string } | null = null
  let steps = 0

  const handle = (ev: ClaudeCodeEvent) => {
    if (ev.type === 'text') {
      streamed += ev.text
      options.onChunk?.(ev.text)
    } else if (ev.type === 'tool_use') {
      steps++
      const { serverName, toolName } = splitClaudeToolName(ev.name)
      const event: AgentToolCallEvent = { id: ev.id, serverName, toolName, rawName: ev.name, args: ev.input }
      pendingTools.set(ev.id, { event, startedAt: Date.now() })
      options.onToolCallStart?.(event)
      // Separate the text before and after a tool call, like the built-in loop's steps.
      if (streamed && !streamed.endsWith('\n\n')) {
        const sep = streamed.endsWith('\n') ? '\n' : '\n\n'
        streamed += sep
        options.onChunk?.(sep)
      }
    } else if (ev.type === 'tool_result') {
      const pending = pendingTools.get(ev.toolUseId)
      if (!pending) return
      pendingTools.delete(ev.toolUseId)
      const toolResult: McpToolCallResult = { isError: ev.isError, content: [{ type: 'text', text: ev.text }] }
      const done: AgentToolCallEvent = {
        ...pending.event,
        result: toolResult,
        isError: ev.isError,
        durationMs: Date.now() - pending.startedAt,
      }
      executedTools.push(done)
      options.onToolCallEnd?.(done)
    } else if (ev.type === 'result') {
      result = ev
    }
  }

  const exit = await new Promise<{ code: number | null; stderr: string; aborted: boolean; startError?: string }>((resolve) => {
    let finished = false
    const offLine = api.onLine((p) => {
      if (p.requestId === requestId) parseClaudeCodeLine(p.line).forEach(handle)
    })
    const offExit = api.onExit((p) => {
      if (p.requestId !== requestId) return
      finish({ code: p.code, stderr: p.stderr, aborted: Boolean(options.signal?.aborted) })
    })
    const onAbort = () => void api.cancel(requestId)
    options.signal?.addEventListener('abort', onAbort)
    function finish(value: { code: number | null; stderr: string; aborted: boolean; startError?: string }) {
      if (finished) return
      finished = true
      offLine()
      offExit()
      options.signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }
    api
      .run({ requestId, prompt, systemPrompt })
      .then((r) => {
        if (!r.ok) finish({ code: null, stderr: '', aborted: false, startError: r.error || 'Could not start Claude Code.' })
      })
      .catch((e) => finish({ code: null, stderr: '', aborted: false, startError: String(e?.message || e) }))
  })

  if (exit.aborted) throw new DOMException('Agent loop aborted by user', 'AbortError')

  const final = result as { isError: boolean; text: string } | null
  const error =
    exit.startError ||
    (final?.isError ? final.text || 'Claude Code reported an error.' : undefined) ||
    (!final && exit.code !== 0 ? exit.stderr.split('\n').slice(-3).join('\n') || `Claude Code exited with code ${exit.code}.` : undefined)
  // The chat shows thrown errors; keep what streamed before the failure when there is some.
  if (error && !streamed.trim()) throw new Error(error)

  const finalText = (streamed.trim() ? streamed : final?.text || '') + (error ? `\n\n*(Claude Code stopped: ${error})*` : '')
  const history: AiChatMessage[] = [
    ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
    { role: 'user' as const, content: options.userPrompt },
    { role: 'assistant' as const, content: finalText },
  ]
  return { success: !error, finalText, steps: Math.max(1, steps), history, executedTools, error }
}
