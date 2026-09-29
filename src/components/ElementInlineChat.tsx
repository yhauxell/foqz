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
  CheckSquare,
  Check,
} from 'lucide-react'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
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

function extractCheckpoints(text: string): string[] {
  const lines = text.split('\n')
  const results: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/^[-*]\s+\[[ xX]?\]\s+/.test(line)) {
      results.push(line)
    } else if (/^\d+\.\s+\[[ xX]?\]\s+/.test(line)) {
      results.push(line.replace(/^\d+\.\s+/, '- '))
    }
  }
  if (results.length === 0) {
    const bulletLines = lines
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+[a-zA-Z0-9`"']/.test(l))
    if (bulletLines.length >= 2 && /criteria|acceptance|checklist|steps|tasks|checkpoints/i.test(text)) {
      for (const bl of bulletLines) {
        results.push(bl.replace(/^[-*]\s+/, '- [ ] '))
      }
    }
  }
  return results
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
  const allEdges = useFlowCanvasStore((s) => s.edges)
  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId)

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
      const isTaskActive = !isCanvasScope && node?.type === 'focusTask'
      const parentId = isCanvasScope ? undefined : (containingProject?.id || node?.parentId)
      const newEdges: Edge[] = []

      for (const act of actions) {
        if (act.type === 'task') {
          const taskPos =
            isTaskActive && node
              ? {
                  x: Math.round(node.position.x + 28),
                  y: Math.round(node.position.y + 95 * (count + 1)),
                }
              : undefined

          const newId = store.createTask({
            title: act.title || 'Untitled Task',
            priority: (act.priority as any) ?? 3,
            notes: act.notes,
            parentId,
            position: taskPos,
          })

          if (isTaskActive && node) {
            newEdges.push({
              id: `e-${node.id}-${newId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: node.id,
              sourceHandle: 'bottom',
              target: newId,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
          }
          count++
        } else if (act.type === 'project') {
          store.createProject({
            title: act.title || 'Untitled Project',
            goal: act.notes,
          })
          count++
        }
      }

      if (newEdges.length > 0) {
        store.setEdges((prev) => [...prev, ...newEdges])
      }

      setSpawnedCount(count)
      setTimeout(() => setSpawnedCount(null), 3000)
    },
    [isCanvasScope, containingProject, node]
  )

  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, _index: number) => {
      const store = useFlowCanvasStore.getState()
      const isTaskActive = !isCanvasScope && node?.type === 'focusTask'
      const parentId = isCanvasScope ? undefined : (containingProject?.id || node?.parentId)

      if (action.type === 'task') {
        const existingSubtasks =
          isTaskActive && node
            ? store.nodes.filter(
                (n) => n.parentId === (node.parentId || parentId) && n.type === 'focusTask'
              ).length
            : 0

        const taskPos =
          isTaskActive && node
            ? {
                x: Math.round(node.position.x + 28),
                y: Math.round(node.position.y + 95 * Math.max(1, existingSubtasks + 1)),
              }
            : undefined

        const newId = store.createTask({
          title: action.title || 'Untitled Task',
          priority: (action.priority as any) ?? 3,
          notes: action.notes,
          parentId,
          position: taskPos,
        })

        if (isTaskActive && node) {
          store.setEdges((prev) => [
            ...prev,
            {
              id: `e-${node.id}-${newId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: node.id,
              sourceHandle: 'bottom',
              target: newId,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            },
          ])
        }
      } else if (action.type === 'project') {
        store.createProject({
          title: action.title || 'Untitled Project',
          goal: action.notes,
        })
      }
    },
    [isCanvasScope, containingProject, node]
  )

  const [appliedMsgIds, setAppliedMsgIds] = useState<Record<string, boolean>>({})

  const handleApplyCheckpoints = useCallback(
    (msgId: string, checkpoints: string[]) => {
      if (!node) return
      const store = useFlowCanvasStore.getState()
      const existingNotes = ((node.data as any)?.notes as string) || ''
      const newItems = checkpoints.join('\n')
      const mergedNotes = existingNotes ? `${existingNotes}\n\n${newItems}` : newItems

      store.updateNodeData(node.id, {
        notes: mergedNotes,
      })

      const lineCount = mergedNotes.split('\n').filter(Boolean).length
      const autoHeight = Math.max(84, 84 + lineCount * 24)
      store.setNodes((nodes) =>
        nodes.map((n) =>
          n.id === node.id ? { ...n, style: { ...n.style, height: autoHeight } } : n
        )
      )

      setAppliedMsgIds((prev) => ({ ...prev, [msgId]: true }))
    },
    [node]
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
    let text = (overridePrompt || prompt).trim()
    if (!text || (!node && !isCanvasScope) || isStreaming) return

    if (text === '/expand' || text.startsWith('/expand ')) {
      const extra = text.replace(/^\/expand\s*/, '').trim()
      text = extra
        ? `Break this task down into subtasks and link them using expand_task: ${extra}`
        : 'Break this task down into 3 concrete subtasks and link them using expand_task.'
    } else if (text === '/done' || text.startsWith('/done ')) {
      text = 'Mark this task as done using update_node.'
    } else if (text.startsWith('/prio')) {
      const match = text.match(/^\/prio\s*([1-4])?/)
      const prioNum = match?.[1] || '1'
      text = `Set priority of this task to P${prioNum} using update_node.`
    } else if (text === '/focus' || text.startsWith('/focus ')) {
      text = 'Start a 25-minute focus session on this task using start_focus_session.'
    } else if (text === '/stop' || text === '/unfocus' || text === '/exitfocus') {
      text = 'Stop the active focus session and unlock canvas using stop_focus_session.'
    } else if (text === '/criteria' || text.startsWith('/criteria ')) {
      text = `Use update_node(nodeId: "${node?.id}", appendNotes: "...") to directly append 3 concrete acceptance criteria checkpoints ("- [ ] ...") to this task's notes.`
    } else if (text.startsWith('/rename')) {
      const newTitle = text.replace(/^\/rename\s*/, '').trim()
      text = newTitle
        ? `Update this task title to "${newTitle}" using update_node.`
        : 'Update this task title using update_node.'
    }

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
    const localToolExecutor = createFlowCanvasToolExecutor(node?.id)

    // Build rich selectedNodeContext
    const selectedNodeContext = node
      ? {
          id: node.id,
          type: node.type,
          title: currentShapeText,
          status: (node.data as any)?.status || 'open',
          priority: (node.data as any)?.priority ?? 3,
          notes: (node.data as any)?.notes || '',
          paper: (node.data as any)?.paper || 'cream',
          parentId: node.parentId || null,
          parentProject: containingProject
            ? {
                id: containingProject.id,
                title: (containingProject.data as any)?.title || 'Untitled Project',
                goal: (containingProject.data as any)?.goal || '',
              }
            : null,
          connectedEdges: allEdges
            .filter((e) => e.source === node.id || e.target === node.id)
            .map((e) => ({
              direction: e.source === node.id ? 'outgoing' : 'incoming',
              otherNodeId: e.source === node.id ? e.target : e.source,
              relation: (e.data as any)?.relation || 'depends',
            })),
        }
      : null

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

You have native spatial canvas tools:
- \`spawn_tasks\`: Create tasks or stage items.
- \`update_node\`: Mutate any project or task.
- \`connect_nodes\`: Create dependency edges between nodes.
- \`start_focus_session\`: Launch a focus session countdown timer.
- \`delete_node\`: Remove nodes from the board.
- \`jev_audit_portfolio\` / \`jev_triage_items\`: Evaluate and prioritize.

Your job is macro-level direction, prioritization, and sprint staging:
1. Help the founder identify the single highest-leverage focus for today without context switching.
2. Recommend unblocking critical path dependencies before starting peripheral tasks.
3. When asked to stage priorities or plan the day, invoke canvas tools or output \`\`\`canvas blocks.`
    } else if (node?.type === 'projectFrame') {
      const childTasks = allNodes.filter((n) => n.parentId === node.id && n.type === 'focusTask')
      const projectData = (node.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are the Technical Project Architect for "${currentShapeText}" (id: ${node.id}).
Goal: "${projectData.goal || 'No goal specified'}"
Tasks inside this project: ${childTasks.length} (${childTasks.map((t) => (t.data as any)?.title).join(', ')})
${connectedRepo ? `Connected GitHub Repository: "${connectedRepo}"` : ''}

You have ACTIVE MUTATION TOOLS to directly manipulate this project and its tasks:
- To update this project frame's title, goal, or notes, invoke \`update_node(nodeId: "${node.id}", ...)\`.
- To create tasks inside this project, invoke \`spawn_tasks\` or output \`\`\`canvas blocks.
- To connect tasks and projects with dependencies, invoke \`connect_nodes\`.
- To delete obsolete nodes, invoke \`delete_node\`.

Your job is technical execution planning:
1. Deconstruct milestone goals into concrete, bite-sized focus tasks with clear acceptance criteria.
2. Maintain clean causality and dependencies between tasks.
3. Directly apply project updates or create connected tasks using your tools rather than just describing them.`
    } else {
      const taskData = (node?.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are a Senior Pair Programmer focused on the active card: "${currentShapeText}" (id: ${node?.id}, type: ${node?.type || 'task'}).
Status: ${taskData.status || 'open'} | Priority: P${taskData.priority ?? 3} | Paper: ${taskData.paper || 'cream'}
${taskData.notes ? `Task Notes / Checkpoints:\n${taskData.notes}` : 'No notes/checkpoints yet.'}
${containingProject ? `Parent Project: "${(containingProject.data as any)?.title}" (id: ${containingProject.id}, Goal: "${(containingProject.data as any)?.goal}")` : 'No parent project.'}

You have ACTIVE MUTATION TOOLS to directly manipulate the spatial canvas:
- To change this task's title, checklist, priority, paper theme, or status, invoke the \`update_node\` tool directly (e.g. \`update_node(nodeId: "${node?.id}", status: "done")\`).
- To append acceptance criteria or markdown checklists to this task's notes, invoke \`update_node(nodeId: "${node?.id}", appendNotes: "...")\`.
- To break this task down into subtasks, invoke the \`expand_task\` tool with concrete steps (e.g. \`expand_task(taskId: "${node?.id}", subtasks: [...])\`). This automatically creates child cards positioned below this task and connects them with dependency edges.
- To connect this task to other nodes, invoke the \`connect_nodes\` tool.
- To launch a focused work session on this task, invoke \`start_focus_session(taskId: "${node?.id}", durationMinutes: 25)\`.
- To remove this task or any node, invoke \`delete_node(nodeId: "${node?.id}")\`.

Do NOT just passively describe what could be done — when the user asks to modify, decompose, prioritize, or start the task, directly invoke your native tools!`
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
          ? `Macro Board Overview: ${allNodes.length} items total on canvas (${allNodes.filter((n) => n.type === 'projectFrame').length} projects, ${allNodes.filter((n) => n.type === 'focusTask').length} tasks)`
          : `Active Selected Node Context:\n${JSON.stringify(selectedNodeContext, null, 2)}`,
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
        zIndex: 6500,
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
                    onClick={() => handleSend('Break this task down into 3 concrete subtasks and link them using expand_task.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ⚡ Break down and link subtasks
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Add acceptance criteria and checkpoint checklist to this task notes using update_node appendNotes.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    📝 Add acceptance criteria
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Set priority of this task to P1 Urgent using update_node.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    🎯 Set priority to P1 Urgent
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Start a 25-minute focus session on this task using start_focus_session.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ▶ Lock into 25m Focus Session
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

                  {/* 1-Click Checkpoints Ingestion for Focus Task */}
                  {isTask && (() => {
                    const checkpoints = extractCheckpoints(m.content)
                    if (checkpoints.length === 0) return null
                    return (
                      <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                        {appliedMsgIds[m.id] ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 select-none">
                            <Check className="size-3" />
                            <span>Checkpoints applied to card</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleApplyCheckpoints(m.id, checkpoints)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-2xs cursor-pointer select-none"
                          >
                            <CheckSquare className="size-3 text-emerald-400 dark:text-emerald-600" />
                            <span>Apply {checkpoints.length} Checkpoints to Card</span>
                          </button>
                        )}
                      </div>
                    )
                  })()}
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
      <div className="p-2.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] shrink-0 space-y-1.5">
        {isTask && !isStreaming && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => handleSend('/expand')}
              className="px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
            >
              <Zap className="size-2.5 text-amber-500" />
              <span>Break down</span>
            </button>
            <button
              type="button"
              onClick={() => handleSend('/criteria')}
              className="px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors cursor-pointer"
            >
              📝 Criteria
            </button>
            <button
              type="button"
              onClick={() => handleSend('Set priority of this task to P1 Urgent using update_node.')}
              className="px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
            >
              <Target className="size-2.5 text-rose-500" />
              <span>P1 Urgent</span>
            </button>
            {activeFocusNodeId === node?.id ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('foqz:set-focus-target', {
                        detail: { shapeId: node.id },
                      })
                    )
                  }}
                  className="px-2 py-0.5 rounded-full border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-[10px] text-blue-700 dark:text-blue-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Lock className="size-2.5 text-blue-600" />
                  <span>Locked Focus</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('/stop')}
                  className="px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900 text-[10px] text-rose-700 dark:text-rose-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
                >
                  <X className="size-2.5 text-rose-600" />
                  <span>Exit Focus</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    'Start a 25-minute focus session on this task using start_focus_session.'
                  )
                }
                className="px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
              >
                <Lock className="size-2.5 text-blue-500" />
                <span>Focus 25m</span>
              </button>
            )}
          </div>
        )}
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
