import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Sparkles,
  ArrowUp,
  X,
  Target,
  Zap,
  Lock,
  GitBranch,
  Wrench,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Maximize2,
  Minimize2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
} from 'lucide-react'
import { useReactFlow, type Node } from '@xyflow/react'
import { useOllama } from '@/lib/ollama'
import { useFocusAppSettingsOptional } from '@/context/FocusAppSettingsContext'
import { getCachedAppSettings } from '@/lib/appSettingsCache'
import { resolveActiveAiConfig } from '@/lib/appSettings'
import { runAgentLoop, type AgentToolCallEvent } from '@/lib/mcpAgentLoop'
import { NATIVE_FOQZ_TOOLS, createFlowCanvasToolExecutor } from '@/lib/canvasTools'
import {
  FOQZ_SYSTEM_PROMPT,
  parseOutputSegments,
  type SpawnableShape,
} from '@/lib/canvasSpawner'
import type { McpTool } from '@/lib/mcpTypes'
import { MarkdownView } from '@/components/MarkdownView'
import { CanvasActionList } from '@/components/CanvasActionList'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'

export interface ElementAiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  executedTools?: AgentToolCallEvent[]
  activeTool?: string | null
}

function JevEvaluationCard({
  content,
  onDeconstruct,
  onFocus,
}: {
  content: string
  onDeconstruct: () => void
  onFocus: () => void
}) {
  const isActionable =
    content.includes('Actionable**: Yes') ||
    content.includes('Actionable: Yes') ||
    content.includes('✅ Yes')

  const probMatch = content.match(/(\d+)%\s*probability/)
  const probability = probMatch ? parseInt(probMatch[1], 10) : (isActionable ? 85 : 15)

  const riskMatch = content.match(/`([^`]+)`/)
  const risk = riskMatch ? riskMatch[1].replace(/_/g, ' ') : 'medium risk'

  return (
    <div className="w-full rounded-2xl border border-blue-500/25 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3 text-xs shadow-xs">
      <div className="flex items-center justify-between border-b border-blue-200/50 dark:border-blue-800/40 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-blue-900 dark:text-blue-300">
          <Target className="size-4 text-blue-600 dark:text-blue-400" />
          <span>Evaluation Verdict</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
            isActionable
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          }`}
        >
          {isActionable ? 'Ready to Build' : 'Ambiguous — Needs Breakdown'}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-zinc-600 dark:text-zinc-400 font-medium">
              Actionability (Concrete Next Step)
            </span>
            <span className="font-semibold text-foreground">{probability}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                probability >= 70
                  ? 'bg-emerald-500'
                  : probability >= 40
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${Math.max(8, probability)}%` }}
            />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5">
            {probability < 50 ? (
              <>
                <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Broad or vague. If you start now, you risk wandering or context-debt. Break it down first!
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Concrete and self-contained. Ready to execute in a single focus session.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-blue-100 dark:border-blue-900/30">
          <span className="text-zinc-600 dark:text-zinc-400">Blast Radius:</span>
          <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-foreground font-medium">
            {risk}
          </span>
        </div>
      </div>

      <div className="pt-2 border-t border-blue-200/50 dark:border-blue-800/40">
        {!isActionable ? (
          <button
            type="button"
            onClick={onDeconstruct}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="size-3.5" />
            <span>Break into 3 Concrete Steps</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onFocus}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Lock className="size-3.5" />
            <span>Lock Into Focus Session (F)</span>
          </button>
        )}
      </div>
    </div>
  )
}

interface ElementInlineChatProps {
  nodeId: string | null
  onClose: () => void
}

export function ElementInlineChat({ nodeId, onClose }: ElementInlineChatProps) {
  const { flowToScreenPosition, getInternalNode } = useReactFlow()
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [mcpTools, setMcpTools] = useState<McpTool[]>([])
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { selectedModel, online } = useOllama()
  const appSettingsCtx = useFocusAppSettingsOptional()
  const settings = appSettingsCtx?.settings || getCachedAppSettings()
  const activeConfig = resolveActiveAiConfig(settings)

  const DEFAULT_WIDTH = 440
  const DEFAULT_HEIGHT = 480
  const MIN_WIDTH = 320
  const MIN_HEIGHT = 260

  const [customPos, setCustomPos] = useState<{ x: number; y: number } | null>(null)
  const [modalSize, setModalSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  })
  const [isMaximized, setIsMaximized] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<string | null>(null)

  const preMaximizeRef = useRef<{
    pos: { x: number; y: number } | null
    size: { width: number; height: number }
  } | null>(null)

  const dragStartRef = useRef<{
    pointerX: number
    pointerY: number
    modalX: number
    modalY: number
  } | null>(null)

  const resizeStartRef = useRef<{
    pointerX: number
    pointerY: number
    startX: number
    startY: number
    startWidth: number
    startHeight: number
    direction: 'se' | 'sw' | 'e' | 'w' | 's'
  } | null>(null)

  useEffect(() => {
    setCustomPos(null)
    setIsMaximized(false)
  }, [nodeId])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose])

  // Get reactive node from flowCanvasStore (or null for board root scope)
  const isCanvasScope = !nodeId || nodeId === '__canvas__'
  const node = useFlowCanvasStore((s) => (isCanvasScope ? null : s.nodes.find((n) => n.id === nodeId)))
  const allNodes = useFlowCanvasStore((s) => s.nodes)

  // Fetch MCP tools
  useEffect(() => {
    const fetchTools = () => {
      if (typeof window !== 'undefined' && window.focusStore?.mcp?.listTools) {
        window.focusStore.mcp
          .listTools()
          .then((tools) => setMcpTools(tools || []))
          .catch(() => {})
      }
    }
    fetchTools()
    window.addEventListener('foqz:mcp-updated', fetchTools)
    return () => window.removeEventListener('foqz:mcp-updated', fetchTools)
  }, [])

  // Resolve containing project
  const containingProject = useMemo(() => {
    if (!node) return null
    if (node.type === 'projectFrame') return node
    if (node.parentId) {
      return allNodes.find((n) => n.id === node.parentId && n.type === 'projectFrame') || null
    }
    return null
  }, [node, allNodes])

  // Resolve connected repository
  const connectedRepo = useMemo(() => {
    if (!node) return null
    const parentData = (containingProject?.data || {}) as Record<string, any>
    if (parentData?.connectors?.githubRepo) {
      return parentData.connectors.githubRepo
    }
    const nodeData = (node.data || {}) as Record<string, any>
    if (nodeData?.connectors?.githubRepo) {
      return nodeData.connectors.githubRepo
    }
    return null
  }, [node, containingProject])

  // Extract element text
  const currentShapeText = useMemo(() => {
    if (isCanvasScope) return 'Board Strategist'
    if (!node) return ''
    const d = (node.data || {}) as Record<string, any>
    return d.title || d.label || d.text || `[${node.type}]`
  }, [node, isCanvasScope])

  // Compute smart viewport placement to fit directly next to the node or centered for canvas
  const placement = useMemo(() => {
    if (isCanvasScope || !node) {
      return {
        x: Math.round(Math.max(16, (window.innerWidth - modalSize.width) / 2)),
        y: Math.max(70, Math.round((window.innerHeight - modalSize.height) / 2 - 30)),
      }
    }
    const internal = getInternalNode(node.id)
    const absPos = internal?.internals?.positionAbsolute ?? node.position
    const nodeW = Number(node.style?.width ?? node.width ?? 280)
    const nodeH = Number(node.style?.height ?? node.height ?? 90)

    const screenTopLeft = flowToScreenPosition({ x: absPos.x, y: absPos.y })
    const screenBottomRight = flowToScreenPosition({ x: absPos.x + nodeW, y: absPos.y + nodeH })

    const shapeLeft = screenTopLeft.x
    const shapeRight = screenBottomRight.x
    const shapeTop = screenTopLeft.y

    const CHAT_WIDTH = modalSize.width
    const CHAT_HEIGHT = modalSize.height
    const GAP = 16
    const TOPBAR_HEIGHT = 56
    const MARGIN = 16

    const spaceRight = window.innerWidth - shapeRight
    const spaceLeft = shapeLeft

    let x: number
    if (spaceRight >= CHAT_WIDTH + GAP + MARGIN) {
      x = shapeRight + GAP
    } else if (spaceLeft >= CHAT_WIDTH + GAP + MARGIN) {
      x = shapeLeft - CHAT_WIDTH - GAP
    } else {
      x = spaceRight > spaceLeft
        ? Math.max(MARGIN, window.innerWidth - CHAT_WIDTH - MARGIN)
        : MARGIN
    }

    let y = Math.max(TOPBAR_HEIGHT + 8, shapeTop - 20)
    const maxY = Math.max(TOPBAR_HEIGHT + 8, window.innerHeight - CHAT_HEIGHT - MARGIN)
    y = Math.min(maxY, y)

    return { x: Math.round(x), y: Math.round(y) }
  }, [isCanvasScope, node, modalSize.width, modalSize.height, flowToScreenPosition, getInternalNode])

  const currentX = customPos ? customPos.x : (placement?.x ?? 80)
  const currentY = customPos ? customPos.y : (placement?.y ?? 80)

  // Dragging modal
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) return
    if (e.button !== 0) return

    e.preventDefault()
    e.stopPropagation()

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      modalX: currentX,
      modalY: currentY,
    }
    setIsDragging(true)

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!dragStartRef.current) return
      const deltaX = moveEvt.clientX - dragStartRef.current.pointerX
      const deltaY = moveEvt.clientY - dragStartRef.current.pointerY

      const maxX = Math.max(0, window.innerWidth - modalSize.width - 12)
      const maxY = Math.max(0, window.innerHeight - 60)
      const nextX = Math.max(12, Math.min(maxX, dragStartRef.current.modalX + deltaX))
      const nextY = Math.max(48, Math.min(maxY, dragStartRef.current.modalY + deltaY))

      setCustomPos({ x: Math.round(nextX), y: Math.round(nextY) })
    }

    const handlePointerUp = () => {
      setIsDragging(false)
      dragStartRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  // Resizing modal
  const handleResizeStart = (
    direction: 'se' | 'sw' | 'e' | 'w' | 's',
    e: React.PointerEvent
  ) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = currentX
    const startY = currentY
    if (!customPos) {
      setCustomPos({ x: startX, y: startY })
    }

    resizeStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX,
      startY,
      startWidth: modalSize.width,
      startHeight: modalSize.height,
      direction,
    }
    setIsResizing(direction)

    const handlePointerMove = (moveEvt: PointerEvent) => {
      if (!resizeStartRef.current) return
      const { pointerX, pointerY, startX: origX, startY: origY, startWidth, startHeight, direction: dir } =
        resizeStartRef.current

      const deltaX = moveEvt.clientX - pointerX
      const deltaY = moveEvt.clientY - pointerY

      const minW = MIN_WIDTH
      const maxW = Math.min(1100, window.innerWidth - 24)
      const minH = MIN_HEIGHT
      const maxH = Math.min(900, window.innerHeight - 60)

      let newWidth = startWidth
      let newHeight = startHeight

      if (dir === 'e' || dir === 'se') {
        const maxAllowedW = window.innerWidth - origX - 12
        newWidth = Math.max(minW, Math.min(Math.min(maxW, maxAllowedW), startWidth + deltaX))
      } else if (dir === 'w' || dir === 'sw') {
        const candidateW = startWidth - deltaX
        const clampedW = Math.max(minW, Math.min(startWidth + origX - 12, Math.min(maxW, candidateW)))
        newWidth = clampedW
        const nextX = origX + (startWidth - clampedW)
        setCustomPos({ x: Math.round(nextX), y: origY })
      }

      if (dir === 's' || dir === 'se' || dir === 'sw') {
        const maxAllowedH = window.innerHeight - origY - 12
        newHeight = Math.max(minH, Math.min(Math.min(maxH, maxAllowedH), startHeight + deltaY))
      }

      setModalSize({ width: Math.round(newWidth), height: Math.round(newHeight) })
    }

    const handlePointerUp = () => {
      setIsResizing(null)
      resizeStartRef.current = null
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  // Maximize / minimize
  const toggleMaximize = () => {
    if (!isMaximized) {
      preMaximizeRef.current = {
        pos: customPos,
        size: modalSize,
      }
      const pad = 24
      const topPad = 60
      const w = Math.min(840, window.innerWidth - pad * 2)
      const h = Math.min(780, window.innerHeight - topPad - pad)
      setCustomPos({
        x: Math.round((window.innerWidth - w) / 2),
        y: Math.round(topPad + (window.innerHeight - topPad - pad - h) / 2),
      })
      setModalSize({ width: w, height: h })
      setIsMaximized(true)
    } else {
      if (preMaximizeRef.current) {
        setCustomPos(preMaximizeRef.current.pos)
        setModalSize(preMaximizeRef.current.size)
      }
      setIsMaximized(false)
    }
  }

  // Conversation history in node.data.aiMessages (or boardAiMessages for canvas scope)
  const [boardAiMessages, setBoardAiMessages] = useState<ElementAiMessage[]>([])

  const messages: ElementAiMessage[] = useMemo(() => {
    if (isCanvasScope) return boardAiMessages
    const d = (node?.data || {}) as Record<string, any>
    return (d.aiMessages as ElementAiMessage[]) || []
  }, [node, isCanvasScope, boardAiMessages])

  const saveMessages = useCallback(
    (newMessages: ElementAiMessage[]) => {
      if (isCanvasScope) {
        setBoardAiMessages(newMessages)
        return
      }
      if (!node) return
      useFlowCanvasStore.getState().updateNodeData(node.id, {
        aiMessages: newMessages,
      })
    },
    [node, isCanvasScope]
  )

  const [spawnedCount, setSpawnedCount] = useState<number | null>(null)

  const handleSpawn = useCallback(
    (actions: SpawnableShape[]) => {
      if (!actions.length) return
      const store = useFlowCanvasStore.getState()
      let count = 0
      const parentId = isCanvasScope ? undefined : containingProject?.id

      for (const act of actions) {
        if (act.type === 'task') {
          store.createTask({
            title: act.title || 'Untitled Task',
            priority: (act.priority as any) ?? 3,
            notes: act.notes,
            parentId,
          })
          count++
        } else if (act.type === 'project') {
          store.createProject({
            title: act.title || 'Untitled Project',
            goal: act.notes,
          })
          count++
        }
      }
      setSpawnedCount(count)
      setTimeout(() => setSpawnedCount(null), 3000)
    },
    [isCanvasScope, containingProject]
  )

  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, _index: number) => {
      const store = useFlowCanvasStore.getState()
      const parentId = isCanvasScope ? undefined : containingProject?.id

      if (action.type === 'task') {
        store.createTask({
          title: action.title || 'Untitled Task',
          priority: (action.priority as any) ?? 3,
          notes: action.notes,
          parentId,
        })
      } else if (action.type === 'project') {
        store.createProject({
          title: action.title || 'Untitled Project',
          goal: action.notes,
        })
      }
    },
    [isCanvasScope, containingProject]
  )

  const handleClearChat = useCallback(() => {
    if (isStreaming) {
      setIsStreaming(false)
      setStreamingContent('')
      setActiveTool(null)
    }
    saveMessages([])
  }, [isStreaming, saveMessages])

  const handleSend = async (overridePrompt?: string) => {
    const text = (overridePrompt || prompt).trim()
    if (!text || (!node && !isCanvasScope) || isStreaming) return

    const userMsg: ElementAiMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const updated = [...messages, userMsg]
    saveMessages(updated)
    setPrompt('')
    setIsStreaming(true)
    setStreamingContent('')
    setActiveTool(null)

    let currentTools = mcpTools
    if (typeof window !== 'undefined' && window.focusStore?.mcp?.listTools) {
      try {
        const fresh = await window.focusStore.mcp.listTools()
        if (fresh && fresh.length > 0) {
          currentTools = fresh
          setMcpTools(fresh)
        }
      } catch {}
    }

    const allTools = [...NATIVE_FOQZ_TOOLS, ...currentTools]
    const localToolExecutor = createFlowCanvasToolExecutor()

    let systemPrompt = ''
    if (isCanvasScope) {
      const projects = allNodes.filter((n) => n.type === 'projectFrame')
      const allTasks = allNodes.filter((n) => n.type === 'focusTask')
      const doneTasks = allTasks.filter((n) => (n.data as any)?.status === 'done')
      const doingTasks = allTasks.filter((n) => (n.data as any)?.status === 'doing')
      const openTasks = allTasks.filter((n) => (n.data as any)?.status === 'open')
      const unlinked = allNodes.filter((n) => !n.parentId && n.type !== 'projectFrame')

      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are the Chief Technical Strategist in Foqz. You have a bird's-eye view of the entire workspace.
Macro Workspace Context:
- Active Projects: ${projects.length} (${projects.map((p) => (p.data as any)?.title || 'Untitled').join(', ') || 'None'})
- Tasks Overview: ${allTasks.length} total (${doneTasks.length} done, ${doingTasks.length} in-progress, ${openTasks.length} open)
- Loose / Scratchpad items: ${unlinked.length}

Your job is macro-level direction, prioritization, and sprint staging:
1. Help the founder identify the single highest-leverage focus for today without context switching.
2. Recommend unblocking critical path dependencies before starting peripheral tasks.
3. When asked to stage priorities or plan the day, output a \`\`\`canvas block with tasks to stage onto the Runway or use available canvas tools.`
    } else if (node?.type === 'projectFrame') {
      const childTasks = allNodes.filter((n) => n.parentId === node.id && n.type === 'focusTask')
      const projectData = (node.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are the Technical Project Architect for "${currentShapeText}".
Goal: "${projectData.goal || 'No goal specified'}"
Tasks inside this project: ${childTasks.length} (${childTasks.map((t) => (t.data as any)?.title).join(', ')})
${connectedRepo ? `Connected GitHub Repository: "${connectedRepo}"` : ''}

Your job is technical execution planning:
1. Deconstruct milestone goals into concrete, bite-sized focus tasks with clear acceptance criteria.
2. Maintain clean causality and dependencies between tasks.
3. Output \`\`\`canvas blocks to spawn tasks directly inside this project frame.`
    } else {
      const taskData = (node?.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are a Senior Pair Programmer focused on a single execution sprint.
Active Element: "${currentShapeText}" (type: ${node?.type || 'task'})
${taskData.notes ? `Task Notes / Checkpoints:\n${taskData.notes}` : ''}
${containingProject ? `Parent Project: "${(containingProject.data as any)?.title}" (Goal: "${(containingProject.data as any)?.goal}")` : ''}

Your job is micro-execution:
1. Ensure the task is small enough for a 25-90 minute Pomodoro session.
2. If ambiguous, generate 3-5 markdown checkbox steps.
3. Provide exact code snippets, debugging hypotheses, or refactoring ideas.`
    }

    let assistantText = ''
    const executedToolsList: AgentToolCallEvent[] = []

    try {
      const result = await runAgentLoop({
        provider: activeConfig.provider,
        model:
          activeConfig.provider === 'ollama'
            ? selectedModel || 'qwen2.5-coder:7b'
            : activeConfig.model,
        apiKey: activeConfig.apiKey,
        baseUrl: activeConfig.baseUrl,
        userPrompt: text,
        systemPrompt,
        canvasContext: isCanvasScope
          ? `Macro Board Overview: ${allNodes.length} items total on canvas`
          : `Current active element text: "${currentShapeText}" (type: ${node?.type})`,
        conversationHistory: updated.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: allTools,
        maxSteps: 12,
        onChunk: (delta) => {
          assistantText += delta
          setStreamingContent(assistantText)
        },
        onToolCallStart: (evt) => {
          setActiveTool(`${evt.serverName || 'foqz'}:${evt.toolName}`)
        },
        onToolCallEnd: (evt) => {
          setActiveTool(null)
          executedToolsList.push(evt)
        },
        localToolExecutor,
      })

      const finalContent = assistantText || result.finalText
      const assistantMsg: ElementAiMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: finalContent,
        timestamp: Date.now(),
        executedTools: executedToolsList,
      }

      saveMessages([...updated, assistantMsg])
    } catch (err: any) {
      const errorMsg: ElementAiMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err.message || 'Failed to complete AI request.'}`,
        timestamp: Date.now(),
      }
      saveMessages([...updated, errorMsg])
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setActiveTool(null)
    }
  }

  // Scroll to bottom on updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  if (!node && !isCanvasScope) return null

  const isTask = node?.type === 'focusTask'
  const isProject = node?.type === 'projectFrame'

  return (
    <div
      style={{
        position: 'fixed',
        left: currentX,
        top: currentY,
        width: isMaximized ? modalSize.width : modalSize.width,
        height: isMaximized ? modalSize.height : modalSize.height,
        zIndex: 6000,
      }}
      className="glass-panel flex flex-col rounded-3xl shadow-2xl border border-white/60 dark:border-zinc-800 backdrop-blur-2xl text-zinc-900 dark:text-zinc-100 select-none animate-in fade-in zoom-in-95 duration-150 overflow-hidden font-sans"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header bar: Draggable */}
      <div
        onPointerDown={handleHeaderPointerDown}
        className={`h-11 px-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between shrink-0 bg-white/20 dark:bg-white/[0.02] ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="size-3.5 text-zinc-400 shrink-0" />
          <div
            className={`size-2 rounded-full shrink-0 ${
              isCanvasScope
                ? 'bg-rose-500'
                : isProject
                ? 'bg-emerald-500'
                : 'bg-blue-500'
            }`}
          />
          <span className="font-semibold text-xs truncate max-w-[200px]" title={currentShapeText}>
            {currentShapeText}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
            {isCanvasScope ? 'Macro Board' : node?.type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {connectedRepo && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60 mr-1">
              <GitBranch className="size-2.5" />
              <span className="truncate max-w-[90px]">{connectedRepo}</span>
            </span>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              title="Clear conversation"
              className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <Trash2 className="size-3" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore size' : 'Maximize'}
            className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            {isMaximized ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close chat (Esc)"
            className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-3 text-xs">
        {messages.length === 0 && !isStreaming && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3">
            <div className="size-10 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-xs text-zinc-800 dark:text-zinc-200">
                {isCanvasScope
                  ? 'Board Strategist • Macro Flight Control'
                  : `Chat with this ${node?.type}`}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[280px]">
                {isCanvasScope
                  ? "Plan your day, stage Today's Runway, triage projects, or evaluate macro priorities."
                  : 'Ask questions, decompose into subtasks, evaluate execution readiness, or brainstorm.'}
              </p>
            </div>

            {/* Quick Action Pills */}
            <div className="flex flex-wrap gap-1.5 justify-center pt-2 max-w-[340px]">
              {isCanvasScope && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend("Stage Today's Runway frame with the top 2-3 critical path focus tasks.")}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ⚡ Stage Today's Runway
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("Audit my projects and backlog: what is my single highest-leverage task today?")}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    📊 Audit Highest Leverage
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend("Identify any blocking tasks or dependencies across all projects.")}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    🔍 Find Blockers
                  </button>
                </>
              )}
              {isTask && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend('Break this task down into 3 concrete next action steps.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ⚡ Break down into 3 steps
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('What are the main edge cases and technical risks for this task?')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    🛡 Identify technical risks
                  </button>
                </>
              )}
              {isProject && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend('Generate a sequential 4-step task workflow to launch this project milestone.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ✨ Generate milestone tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('List the key deliverables and success metrics for this project.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    🎯 List deliverables
                  </button>
                </>
              )}
              {!isTask && !isProject && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend('Turn this note or shape into structured actionable task cards.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    📝 Convert to Task Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Summarize the main idea and suggest improvements.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    💡 Summarize & Expand
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`px-3.5 py-2 rounded-2xl max-w-[90%] ${
                m.role === 'user'
                  ? 'rounded-tr-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 whitespace-pre-wrap select-text'
                  : 'rounded-tl-sm bg-white/80 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border border-black/[0.06] dark:border-white/[0.08] shadow-2xs select-text'
              }`}
            >
              {m.role === 'user' ? (
                m.content
              ) : (
                <div className="space-y-2">
                  {parseOutputSegments(m.content).map((seg, sIdx) => {
                    if (seg.type === 'text') {
                      return <MarkdownView key={sIdx} content={seg.content} />
                    }
                    if (seg.type === 'canvas') {
                      return (
                        <CanvasActionList
                          key={sIdx}
                          actions={seg.actions}
                          onSpawnAll={() => handleSpawn(seg.actions)}
                          onSpawnSingle={handleSpawnSingle}
                          spawnedCount={spawnedCount}
                        />
                      )
                    }
                    return null
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex flex-col items-start">
            <div className="px-3.5 py-2 rounded-2xl rounded-tl-sm max-w-[90%] bg-white/80 dark:bg-zinc-900/80 text-zinc-900 dark:text-zinc-100 border border-black/[0.06] dark:border-white/[0.08] shadow-2xs">
              <MarkdownView content={streamingContent} />
            </div>
          </div>
        )}

        {activeTool && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-[11px] font-mono w-fit animate-pulse border border-blue-200/60 dark:border-blue-800/60">
            <Wrench className="size-3 animate-spin" />
            <span>Calling tool: {activeTool}</span>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="p-2.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/80 dark:bg-zinc-900/80 border border-black/[0.08] dark:border-white/[0.1] shadow-2xs">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={`Ask about "${currentShapeText.slice(0, 20)}..." (Enter to send)`}
            rows={1}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 leading-relaxed font-sans max-h-24"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isStreaming}
            className="size-7 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-30 disabled:hover:bg-blue-600 flex items-center justify-center transition-all cursor-pointer shrink-0"
          >
            <ArrowUp className="size-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Resize corner handle */}
      {!isMaximized && (
        <div
          onPointerDown={(e) => handleResizeStart('se', e)}
          className="absolute bottom-0 right-0 size-4 cursor-se-resize flex items-center justify-center text-zinc-400/60 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          <svg className="size-2.5" viewBox="0 0 6 6" fill="currentColor">
            <circle cx="5" cy="5" r="0.75" />
            <circle cx="5" cy="2" r="0.75" />
            <circle cx="2" cy="5" r="0.75" />
          </svg>
        </div>
      )}
    </div>
  )
}
