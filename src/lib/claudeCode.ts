import type { McpToolCallResult } from './mcpTypes'
import type { AiChatMessage } from './aiProvider'
import type { AgentLoopResult, AgentToolCallEvent, RunAgentLoopOptions } from './mcpAgentLoop'
import type { ClaudeCodeProfile } from './appSettings'

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

/** Where a run starts and what it may do there, as resolved by main from Settings. */
export interface ClaudeCodeFolderAccess {
  ok: boolean
  error?: string
  cwd?: string
  /** True when no folder was set anywhere and the run uses the empty Foqz-owned folder. */
  isDefault?: boolean
  profile?: ClaudeCodeProfile
  bashAllowlist?: string[]
}

export interface ClaudeCodeRunRequest {
  requestId: string
  prompt: string
  systemPrompt?: string
  /** The item's local folder; empty uses Settings → Intelligence → Working folder. */
  folder?: string
  /** One run per item at a time. */
  nodeId?: string
  /** A UUID: started with `--session-id`, or continued with `--resume` when `resume` is set. */
  sessionId?: string
  resume?: boolean
}

/** Per-run choices the chat passes through runAgentLoop. */
export interface ClaudeCodeRunOptions {
  folder?: string
  nodeId?: string
  /** The access main reported for `folder`; only non-canvas profiles keep sessions. */
  profile?: ClaudeCodeProfile
  /** The session to continue; none starts a new one. */
  sessionId?: string | null
}

export type ClaudeCodeEvent =
  | { type: 'init'; sessionId: string; tools: string[] }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
  | { type: 'tool_result'; toolUseId: string; isError: boolean; text: string }
  | {
      type: 'result'
      isError: boolean
      text: string
      costUsd?: number
      durationMs?: number
      numTurns?: number
      sessionId?: string
    }

export interface ClaudeCodeRunLogEntry {
  kind: 'text' | 'tool_use' | 'tool_result' | 'stderr' | 'notice'
  /** The tool's name for tool_use, and for tool_result the tool it answers. */
  name?: string
  text: string
  isError?: boolean
}

/** One run as the chat's run log shows it. */
export interface ClaudeCodeRunRecord {
  startedAt: number
  durationMs: number
  costUsd?: number
  numTurns?: number
  isError: boolean
  profile?: ClaudeCodeProfile
  cwd?: string
  sessionId?: string
  /** Files the run created or edited, relative to `cwd` when inside it. */
  changedFiles: string[]
  entries: ClaudeCodeRunLogEntry[]
}

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

  if (msg.type === 'system' && msg.subtype === 'init' && typeof msg.session_id === 'string') {
    return [{ type: 'init', sessionId: msg.session_id, tools: Array.isArray(msg.tools) ? msg.tools.map(String) : [] }]
  }

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
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
    return [
      {
        type: 'result',
        isError: msg.is_error === true,
        text: typeof msg.result === 'string' ? msg.result : '',
        costUsd: num(msg.total_cost_usd),
        durationMs: num(msg.duration_ms),
        numTurns: num(msg.num_turns),
        sessionId: typeof msg.session_id === 'string' ? msg.session_id : undefined,
      },
    ]
  }
  return []
}

/** `mcp__foqz__update_node` → server `foqz`, tool `update_node`; built-ins have no server. */
export function splitClaudeToolName(name: string): { serverName?: string; toolName: string } {
  const m = name.match(/^mcp__(.+?)__(.+)$/)
  return m ? { serverName: m[1], toolName: m[2] } : { toolName: name }
}

/**
 * Claude Code takes one prompt, so earlier turns and the canvas context are written into it.
 * A resumed session already has the earlier turns, so `resumed` leaves them out.
 */
export function buildClaudeCodePrompt(
  options: Pick<RunAgentLoopOptions, 'userPrompt' | 'canvasContext' | 'conversationHistory'>,
  resumed = false,
): string {
  const parts: string[] = []
  // The chat passes the new user message as the last history entry too; it goes at the end.
  const history = resumed ? [] : (options.conversationHistory || []).filter((m) => m.role === 'user' || m.role === 'assistant')
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


/** Tells Claude Code what it may do outside the canvas, so it does not try tools it does not have. */
export function folderNote(profile: ClaudeCodeProfile | undefined, cwd: string | undefined): string {
  if (!profile || profile === 'canvas' || !cwd) return 'You have no access to files or a shell here; work only through the canvas tools.'
  if (profile === 'read') return `You are working in the folder ${cwd}. You can read and search its files, but not change them or run commands.`
  return `You are working in the folder ${cwd}. You can read and edit its files and run the shell commands the user allowed; anything else is refused.`
}

const MAX_LOG_ENTRIES = 300
const MAX_LOG_TEXT = 4_000
const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function clip(text: string): string {
  return text.length > MAX_LOG_TEXT ? `${text.slice(0, MAX_LOG_TEXT)}\n… (${text.length - MAX_LOG_TEXT} more characters)` : text
}

/** A new session id; Claude Code takes it with `--session-id` and continues it with `--resume`. */
export function newClaudeCodeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16))
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** True when `--resume` failed because Claude Code no longer has the session. */
export function isMissingSessionError(text: string): boolean {
  return /no conversation found/i.test(text)
}

interface AttemptOutcome {
  exit: { code: number | null; stderr: string; aborted: boolean; startError?: string }
  result: Extract<ClaudeCodeEvent, { type: 'result' }> | null
  streamed: string
  steps: number
  executedTools: AgentToolCallEvent[]
  entries: ClaudeCodeRunLogEntry[]
  changedFiles: string[]
  sessionId?: string
  profile?: ClaudeCodeProfile
  cwd?: string
  /** Main kept the session (non-canvas profiles); canvas runs have nothing to resume. */
  persistent?: boolean
}

/** Runs one chat turn through the local Claude Code CLI. Same contract as runAgentLoop. */
export async function runClaudeCodeAgent(options: RunAgentLoopOptions): Promise<AgentLoopResult> {
  const api = typeof window !== 'undefined' ? window.focusStore?.claudeCode : undefined
  if (!api) {
    return { success: false, finalText: '', steps: 0, history: [], executedTools: [], error: 'Claude Code runs only in the Foqz desktop app.' }
  }

  const cc = options.claudeCode || {}
  const persistent = Boolean(cc.profile && cc.profile !== 'canvas')
  const startedAt = Date.now()
  const systemPrompt = [CANVAS_TOOLS_NOTE, options.systemPrompt].filter(Boolean).join('\n\n')

  const attempt = (sessionId: string | undefined, resume: boolean, emitted: { text: string }) =>
    new Promise<AttemptOutcome>((resolve) => {
      const requestId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const out: AttemptOutcome = {
        exit: { code: null, stderr: '', aborted: false },
        result: null,
        streamed: '',
        steps: 0,
        executedTools: [],
        entries: [],
        changedFiles: [],
        sessionId,
      }
      const pendingTools = new Map<string, { event: AgentToolCallEvent; startedAt: number }>()
      const log = (entry: ClaudeCodeRunLogEntry) => {
        const last = out.entries[out.entries.length - 1]
        if (entry.kind === 'text' && last?.kind === 'text') {
          last.text = clip(last.text + entry.text)
          return
        }
        if (out.entries.length < MAX_LOG_ENTRIES) out.entries.push({ ...entry, text: clip(entry.text) })
      }
      const emit = (text: string) => {
        out.streamed += text
        emitted.text += text
        options.onChunk?.(text)
      }

      const handle = (ev: ClaudeCodeEvent) => {
        if (ev.type === 'init') {
          out.sessionId = ev.sessionId
        } else if (ev.type === 'text') {
          log({ kind: 'text', text: ev.text })
          emit(ev.text)
        } else if (ev.type === 'tool_use') {
          // Claude Code loads MCP tool schemas on demand; that lookup is not a step worth a card.
          if (ev.name === 'ToolSearch') return
          out.steps++
          log({ kind: 'tool_use', name: ev.name, text: JSON.stringify(ev.input, null, 2) })
          if (EDIT_TOOL_NAMES.has(ev.name)) {
            const file = String(ev.input?.file_path || ev.input?.notebook_path || '')
            if (file && !out.changedFiles.includes(file)) out.changedFiles.push(file)
          }
          const { serverName, toolName } = splitClaudeToolName(ev.name)
          const event: AgentToolCallEvent = { id: ev.id, serverName, toolName, rawName: ev.name, args: ev.input }
          pendingTools.set(ev.id, { event, startedAt: Date.now() })
          options.onToolCallStart?.(event)
          // Separate the text before and after a tool call, like the built-in loop's steps.
          if (emitted.text && !emitted.text.endsWith('\n\n')) emit(emitted.text.endsWith('\n') ? '\n' : '\n\n')
        } else if (ev.type === 'tool_result') {
          const pending = pendingTools.get(ev.toolUseId)
          if (!pending) return
          pendingTools.delete(ev.toolUseId)
          log({ kind: 'tool_result', name: pending.event.rawName, text: ev.text, isError: ev.isError })
          const toolResult: McpToolCallResult = { isError: ev.isError, content: [{ type: 'text', text: ev.text }] }
          const done: AgentToolCallEvent = {
            ...pending.event,
            result: toolResult,
            isError: ev.isError,
            durationMs: Date.now() - pending.startedAt,
          }
          out.executedTools.push(done)
          options.onToolCallEnd?.(done)
        } else if (ev.type === 'result') {
          out.result = ev
          if (ev.sessionId) out.sessionId = ev.sessionId
        }
      }

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
      function finish(exit: AttemptOutcome['exit']) {
        if (finished) return
        finished = true
        offLine()
        offExit()
        options.signal?.removeEventListener('abort', onAbort)
        out.exit = exit
        if (exit.stderr) log({ kind: 'stderr', text: exit.stderr, isError: exit.code !== 0 })
        resolve(out)
      }
      const prompt = buildClaudeCodePrompt(options, resume)
      api
        .run({ requestId, prompt, systemPrompt, folder: cc.folder, nodeId: cc.nodeId, sessionId, resume })
        .then((r) => {
          if (!r.ok) {
            finish({ code: null, stderr: '', aborted: false, startError: r.error || 'Could not start Claude Code.' })
            return
          }
          out.profile = r.profile
          out.cwd = r.cwd
          out.persistent = r.persistent === true
        })
        .catch((e) => finish({ code: null, stderr: '', aborted: false, startError: String(e?.message || e) }))
    })

  const emitted = { text: '' }
  const resuming = persistent && Boolean(cc.sessionId)
  let outcome = await attempt(persistent ? cc.sessionId || newClaudeCodeSessionId() : undefined, resuming, emitted)
  let notice = ''
  // The session can be gone (cleared by Claude Code, another machine): start over with the chat history.
  if (
    resuming &&
    !outcome.exit.aborted &&
    !outcome.streamed.trim() &&
    isMissingSessionError(`${outcome.exit.stderr}\n${outcome.result?.text || ''}`)
  ) {
    notice = '*(The previous Claude Code session was gone, so this started a new one.)*'
    options.onChunk?.(`${notice}\n\n`)
    emitted.text += `${notice}\n\n`
    outcome = await attempt(newClaudeCodeSessionId(), false, emitted)
    outcome.entries.unshift({ kind: 'notice', text: notice })
  }

  if (outcome.exit.aborted) throw new DOMException('Agent loop aborted by user', 'AbortError')

  const { exit, result: final, streamed } = outcome
  const error =
    exit.startError ||
    (final?.isError ? final.text || exit.stderr.split('\n').slice(-3).join('\n') || 'Claude Code reported an error.' : undefined) ||
    (!final && exit.code !== 0 ? exit.stderr.split('\n').slice(-3).join('\n') || `Claude Code exited with code ${exit.code}.` : undefined)
  // The chat shows thrown errors; keep what streamed before the failure when there is some.
  if (error && !streamed.trim()) throw new Error(error)

  const cwd = outcome.cwd
  const changedFiles = outcome.changedFiles.map((f) => (cwd && f.startsWith(`${cwd}/`) ? f.slice(cwd.length + 1) : f))
  const body = streamed.trim() ? streamed : final?.text || ''
  const finalText = [notice, body].filter(Boolean).join('\n\n') + (error ? `\n\n*(Claude Code stopped: ${error})*` : '')
  const history: AiChatMessage[] = [
    ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
    { role: 'user' as const, content: options.userPrompt },
    { role: 'assistant' as const, content: finalText },
  ]
  const claudeCodeRun: ClaudeCodeRunRecord = {
    startedAt,
    durationMs: final?.durationMs ?? Date.now() - startedAt,
    costUsd: final?.costUsd,
    numTurns: final?.numTurns,
    isError: Boolean(error),
    profile: outcome.profile,
    cwd,
    sessionId: outcome.persistent ? outcome.sessionId : undefined,
    changedFiles,
    entries: outcome.entries,
  }
  return {
    success: !error,
    finalText,
    steps: Math.max(1, outcome.steps),
    history,
    executedTools: outcome.executedTools,
    error,
    claudeCodeRun,
  }
}
