import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Sparkles,
  ArrowUp,
  Square,
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
  Cpu,
  Flag,
  Edit3,
} from 'lucide-react'
import { useReactFlow, type Node, type Edge } from '@xyflow/react'
import { useOllama } from '@/lib/ollama'
import { useFocusAppSettingsOptional } from '@/context/FocusAppSettingsContext'
import { getCachedAppSettings, patchCachedAppSettings } from '@/lib/appSettingsCache'
import { resolveActiveAiConfig } from '@/lib/appSettings'
import { runAgentLoop, type AgentToolCallEvent } from '@/lib/mcpAgentLoop'
import { NATIVE_FOQZ_TOOLS, createFlowCanvasToolExecutor } from '@/lib/canvasTools'
import { OPENAI_DEFAULT_MODELS, GEMINI_DEFAULT_MODELS } from '@/lib/aiConnectors'
import type { AiProviderName } from '@/lib/aiProvider'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  FOQZ_SYSTEM_PROMPT,
  parseOutputSegments,
  type SpawnableShape,
} from '@/lib/canvasSpawner'
import type { McpTool } from '@/lib/mcpTypes'
import { MarkdownView } from '@/components/MarkdownView'
import { CanvasActionList, type SpawnTreeOptions } from '@/components/CanvasActionList'
import { ActiveNodeControlStrip } from '@/components/ActiveNodeControlStrip'
import { ExecutedToolDiffCard, ProposedUpdateCard } from '@/components/NodeUpdateActionCard'
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
  const isProjectVerdict =
    content.includes('Project Readiness Verdict') || content.includes('Execution Path')

  if (isProjectVerdict) {
    const isReady =
      content.includes('Ready for Execution') ||
      content.includes('✅ This project has a concrete') ||
      content.includes('isReady: true')

    const scoreMatch = content.match(/(\d+)%\s*\(/) || content.match(/Readiness Score\*?\*?:\s*(\d+)%/)
    const readinessScore = scoreMatch ? parseInt(scoreMatch[1], 10) : (isReady ? 80 : 35)

    const pathMatch = content.match(/Execution Path\*?\*?:\s*`([^`]+)`/i)
    const execPath = pathMatch ? pathMatch[1] : (isReady ? 'unbroken' : 'ambiguous')

    const urgencyMatch = content.match(/Urgency State\*?\*?:\s*`([^`]+)`/i)
    const urgency = urgencyMatch ? urgencyMatch[1].replace(/_/g, ' ') : 'active momentum'

    return (
      <div className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-3 text-xs shadow-xs">
        <div className="flex items-center justify-between border-b border-emerald-200/50 dark:border-emerald-800/40 pb-2">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-900 dark:text-emerald-300">
            <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Project Readiness Verdict</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
              isReady
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {isReady ? 'Unbroken Path' : 'Needs Planning'}
          </span>
        </div>

        <div className="space-y-2">
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-zinc-600 dark:text-zinc-400 font-medium">
                Milestone Execution Readiness
              </span>
              <span className="font-semibold text-foreground">{readinessScore}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  readinessScore >= 70
                    ? 'bg-emerald-500'
                    : readinessScore >= 45
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(8, readinessScore)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-emerald-100 dark:border-emerald-900/30">
            <span className="text-zinc-600 dark:text-zinc-400">Execution Path:</span>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-foreground font-medium">
              {execPath}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-600 dark:text-zinc-400">Urgency:</span>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-foreground font-medium">
              {urgency}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-800/40">
          <button
            type="button"
            onClick={onDeconstruct}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Zap className="size-3.5" />
            <span>Generate Sequential Milestone Tasks</span>
          </button>
        </div>
      </div>
    )
  }

  const isActionable =
    content.includes('Actionable**: Yes') ||
    content.includes('Actionable: Yes') ||
    content.includes('✅ Yes') ||
    content.includes('✅ This task is concrete')

  const probMatch = content.match(/(\d+)%\s*probability/)
  const probability = probMatch ? parseInt(probMatch[1], 10) : (isActionable ? 85 : 15)

  const riskMatch = content.match(/Blast Radius\*?\*?:\s*`([^`]+)`/i) || content.match(/`([^`]+)`/)
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
  const abortControllerRef = useRef<AbortController | null>(null)

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsStreaming(false)
    setActiveTool(null)
  }, [])
  const { selectedModel, setSelectedModel, online, models } = useOllama()
  const appSettingsCtx = useFocusAppSettingsOptional()
  const settings = appSettingsCtx?.settings || getCachedAppSettings()
  const activeConfig = resolveActiveAiConfig(settings)

  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0)

  const activeModelLabel = useMemo(() => {
    if (activeConfig.provider === 'ollama') {
      return selectedModel || settings.ollamaDefaultModel || 'qwen2.5-coder:7b'
    }
    if (activeConfig.provider === 'openai') {
      return settings.openaiDefaultModel || 'gpt-4o-mini'
    }
    if (activeConfig.provider === 'gemini') {
      return settings.geminiDefaultModel || 'gemini-2.0-flash'
    }
    return activeConfig.model
  }, [activeConfig, selectedModel, settings])

  const isAiReady = useMemo(() => {
    if (activeConfig.provider === 'ollama') return online
    if (activeConfig.provider === 'openai') return Boolean(settings.openaiApiKey?.trim())
    if (activeConfig.provider === 'gemini') return Boolean(settings.geminiApiKey?.trim())
    return Boolean(activeConfig.apiKey)
  }, [activeConfig, online, settings])

  const handleSelectProvider = useCallback(
    (prov: AiProviderName) => {
      if (appSettingsCtx?.update) {
        appSettingsCtx.update({ activeAiProvider: prov })
      }
      patchCachedAppSettings({ activeAiProvider: prov })
    },
    [appSettingsCtx]
  )

  const handleSelectModel = useCallback(
    (prov: AiProviderName, modelName: string) => {
      if (prov === 'openai') {
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: 'openai', openaiDefaultModel: modelName })
        }
        patchCachedAppSettings({ activeAiProvider: 'openai', openaiDefaultModel: modelName })
        try {
          localStorage.setItem('foqz_openai_model', modelName)
        } catch {}
      } else if (prov === 'gemini') {
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: 'gemini', geminiDefaultModel: modelName })
        }
        patchCachedAppSettings({ activeAiProvider: 'gemini', geminiDefaultModel: modelName })
        try {
          localStorage.setItem('foqz_gemini_model', modelName)
        } catch {}
      } else if (prov === 'ollama') {
        setSelectedModel(modelName)
        if (appSettingsCtx?.update) {
          appSettingsCtx.update({ activeAiProvider: 'ollama', ollamaDefaultModel: modelName })
        }
        patchCachedAppSettings({ activeAiProvider: 'ollama', ollamaDefaultModel: modelName })
        try {
          localStorage.setItem('foqz_ollama_model', modelName)
        } catch {}
      }
    },
    [appSettingsCtx, setSelectedModel]
  )

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

  // Stop agent on Escape or close chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (abortControllerRef.current) {
          handleStop()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [onClose, handleStop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

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
    if (node.type === 'note') {
      const title = d.title || 'Note'
      const snippet = d.text ? ` — ${d.text.slice(0, 30)}` : ''
      return `${title}${snippet}`
    }
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
  const BOARD_CHAT_STORAGE_KEY = 'foqz_board_ai_messages'

  const [boardAiMessages, setBoardAiMessages] = useState<ElementAiMessage[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem('foqz_board_ai_messages')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const messages: ElementAiMessage[] = useMemo(() => {
    if (isCanvasScope) return boardAiMessages
    const d = (node?.data || {}) as Record<string, any>
    return (d.aiMessages as ElementAiMessage[]) || []
  }, [node, isCanvasScope, boardAiMessages])

  const saveMessages = useCallback(
    (newMessages: ElementAiMessage[]) => {
      if (isCanvasScope) {
        setBoardAiMessages(newMessages)
        try {
          localStorage.setItem('foqz_board_ai_messages', JSON.stringify(newMessages))
        } catch {}
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
    (actions: SpawnableShape[], options?: SpawnTreeOptions) => {
      if (!actions.length) return
      const store = useFlowCanvasStore.getState()
      let count = 0
      const isTaskActive = !isCanvasScope && node?.type === 'focusTask'
      const parentId = isCanvasScope ? undefined : (containingProject?.id || node?.parentId)
      const linkMode = options?.linkMode || 'chain'
      const selectedSet = options?.selectedIndices ? new Set(options.selectedIndices) : null
      const createdTaskIds: string[] = []

      const targetActions = actions
        .map((act, i) => {
          if (options?.editedTitles && options.editedTitles[i] !== undefined) {
            return { ...act, title: options.editedTitles[i] }
          }
          return act
        })
        .filter((_, i) => selectedSet === null || selectedSet.has(i))

      const isParentActive = !isCanvasScope && (node?.type === 'focusTask' || node?.type === 'note')
      const parentH = Number(node?.style?.height ?? node?.height ?? (node?.type === 'note' ? 180 : 82))

      for (const act of targetActions) {
        if (act.type === 'task') {
          const taskPos =
            isParentActive && node
              ? {
                  x: Math.round(node.position.x + (node.type === 'note' ? 0 : 28)),
                  y: Math.round(node.position.y + parentH + 24 + 95 * count),
                }
              : undefined

          const newId = store.createTask({
            title: act.title || 'Untitled Task',
            priority: (act.priority as any) ?? 3,
            notes: act.notes,
            parentId,
            position: taskPos,
          })

          createdTaskIds.push(newId)
          count++
        } else if (act.type === 'note') {
          const notePos =
            isParentActive && node
              ? {
                  x: Math.round(node.position.x + (node.type === 'note' ? 0 : 28)),
                  y: Math.round(node.position.y + parentH + 24 + 195 * count),
                }
              : undefined

          const newId = store.createNote({
            title: act.title || 'Note',
            text: act.text || act.notes || '',
            variant: (act.color as any) || 'yellow',
            parentId,
            position: notePos,
          })

          createdTaskIds.push(newId)
          count++
        } else if (act.type === 'project') {
          store.createProject({
            title: act.title || 'Untitled Project',
            goal: act.notes,
          })
          count++
        }
      }

      if (isParentActive && node && createdTaskIds.length > 0) {
        const newEdges: Edge[] = []
        if (linkMode === 'fanout') {
          for (const childId of createdTaskIds) {
            newEdges.push({
              id: `e-${node.id}-${childId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: node.id,
              sourceHandle: 'bottom',
              target: childId,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
          }
        } else {
          // Chain: Parent -> T1 -> T2 -> T3
          let prevId = node.id
          for (const childId of createdTaskIds) {
            newEdges.push({
              id: `e-${prevId}-${childId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              type: 'semantic',
              source: prevId,
              sourceHandle: 'bottom',
              target: childId,
              targetHandle: 'top',
              animated: false,
              data: { relation: 'depends' },
            })
            prevId = childId
          }
        }

        if (newEdges.length > 0) {
          store.setEdges((prev) => [...prev, ...newEdges])
        }
      }

      setSpawnedCount(count)
      setTimeout(() => setSpawnedCount(null), 3000)
    },
    [isCanvasScope, containingProject, node]
  )

  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, _index: number) => {
      const store = useFlowCanvasStore.getState()
      const isParentActive = !isCanvasScope && (node?.type === 'focusTask' || node?.type === 'note')
      const parentH = Number(node?.style?.height ?? node?.height ?? (node?.type === 'note' ? 180 : 82))
      const parentId = isCanvasScope ? undefined : (containingProject?.id || node?.parentId)

      if (action.type === 'task') {
        const existingChildren =
          isParentActive && node
            ? store.nodes.filter(
                (n) => n.parentId === (node.parentId || parentId) && (n.type === 'focusTask' || n.type === 'note')
              ).length
            : 0

        const taskPos =
          isParentActive && node
            ? {
                x: Math.round(node.position.x + (node.type === 'note' ? 0 : 28)),
                y: Math.round(node.position.y + parentH + 24 + 95 * existingChildren),
              }
            : undefined

        const newId = store.createTask({
          title: action.title || 'Untitled Task',
          priority: (action.priority as any) ?? 3,
          notes: action.notes,
          parentId,
          position: taskPos,
        })

        if (isParentActive && node) {
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
      } else if (action.type === 'note') {
        const existingChildren =
          isParentActive && node
            ? store.nodes.filter(
                (n) => n.parentId === (node.parentId || parentId) && (n.type === 'focusTask' || n.type === 'note')
              ).length
            : 0

        const notePos =
          isParentActive && node
            ? {
                x: Math.round(node.position.x + (node.type === 'note' ? 0 : 28)),
                y: Math.round(node.position.y + parentH + 24 + 195 * existingChildren),
              }
            : undefined

        const newId = store.createNote({
          title: action.title || 'Note',
          text: action.text || action.notes || '',
          variant: (action.color as any) || 'yellow',
          parentId,
          position: notePos,
        })

        if (isParentActive && node) {
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
    handleStop()
    saveMessages([])
    if (isCanvasScope) {
      try {
        localStorage.removeItem('foqz_board_ai_messages')
      } catch {}
    }
  }, [handleStop, saveMessages, isCanvasScope])

  const handleSend = async (overridePrompt?: string) => {
    let text = (overridePrompt || prompt).trim()
    if (!text || (!node && !isCanvasScope) || isStreaming) return

    // Stop any existing stream
    handleStop()

    if (text === '/eval' || text === '/evaluate' || text.startsWith('/eval ') || text.startsWith('/evaluate ')) {
      if (node?.type === 'projectFrame') {
        text = `Evaluate this project frame's milestone execution readiness and unbroken path using the jev_evaluate_project tool. Present the verdict clearly.`
      } else {
        text = `Evaluate this task actionability, clarity score, and blast radius using the jev_evaluate_task tool. Present the verdict clearly.`
      }
    } else if (text === '/expand' || text.startsWith('/expand ')) {
      const extra = text.replace(/^\/expand\s*/, '').trim()
      if (node?.type === 'note') {
        text = extra
          ? `Deconstruct this note into concrete linked subtasks on the canvas using expand_task: ${extra}`
          : 'Deconstruct this note into 3 concrete linked subtasks on the canvas using expand_task.'
      } else {
        text = extra
          ? `Break this task down into subtasks and link them using expand_task: ${extra}`
          : 'Break this task down into 3 concrete subtasks and link them using expand_task.'
      }
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
        ? `Update this ${node?.type === 'note' ? 'note' : node?.type === 'projectFrame' ? 'project' : 'task'} title to "${newTitle}" using update_node.`
        : `Update this ${node?.type || 'card'} title using update_node.`
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

    const controller = new AbortController()
    abortControllerRef.current = controller

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
    const nodeData = (node?.data || {}) as Record<string, any>
    const selectedNodeContext = node
      ? {
          id: node.id,
          type: node.type,
          title: nodeData.title || currentShapeText,
          text: nodeData.text || '',
          notes: nodeData.notes || nodeData.text || '',
          content: nodeData.text || nodeData.notes || '',
          status: nodeData.status || 'open',
          priority: nodeData.priority ?? 3,
          paper: nodeData.paper || nodeData.variant || 'cream',
          variant: nodeData.variant || 'yellow',
          corner: nodeData.corner || 'folded',
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
      const allChildren = allNodes.filter((n) => n.parentId === node.id)
      const projectData = (node.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are the Technical Project Architect & Conceptual Subsystem Lead for "${currentShapeText}" (id: ${node.id}).
Type: Project Frame / Semantic Group Container
Goal / Objective: "${projectData.goal || 'No goal specified'}"
${projectData.description ? `Semantic Description & Intent: "${projectData.description}"` : ''}
Elements inside this semantic group: ${allChildren.length} (${childTasks.length} tasks: ${childTasks.map((t) => (t.data as any)?.title).join(', ') || 'none'})
${connectedRepo ? `Connected GitHub Repository: "${connectedRepo}"` : ''}

You operate over all elements contained within this group container as a coherent conceptual subsystem.
You have ACTIVE MUTATION TOOLS to directly manipulate this project and its tasks:
- To evaluate milestone execution readiness and unbroken paths using Jev AI, invoke \`jev_evaluate_project(projectId: "${node.id}")\`.
- To update this frame's title, goal, description, or notes, invoke \`update_node(nodeId: "${node.id}", ...)\`.
- To create tasks inside this group, invoke \`spawn_tasks\` or output \`\`\`canvas blocks.
- To group additional elements into a semantic cluster, invoke \`group_nodes(nodeIds: [...], title: "...")\`.
- To connect tasks and projects with dependencies, invoke \`connect_nodes\`.
- To delete obsolete nodes, invoke \`delete_node\`.

Your job is subsystem planning and execution:
1. Deconstruct milestone goals into concrete, bite-sized focus tasks with clear acceptance criteria.
2. Prompts directed at this group operate over all elements contained within it.
3. Maintain clean causality and dependencies between tasks.
4. Directly apply group updates or create connected tasks using your tools rather than just describing them.`
    } else if (node?.type === 'note') {
      const noteData = (node.data || {}) as Record<string, any>
      const noteContent = noteData.text || noteData.notes || ''
      const noteTitle = noteData.title || 'Note'
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are an expert AI Thought Partner and Creative Collaborator chatting directly with this Paper Sticky Note (id: ${node.id}).
Note Title: "${noteTitle}"
Current Note Content:
"""
${noteContent || '(This note is currently empty / blank)'}
"""
Note Styling: Background Theme: ${noteData.variant || 'yellow'} | Corner: ${noteData.corner || 'folded'}
${containingProject ? `Parent Project: "${(containingProject.data as any)?.title}" (id: ${containingProject.id})` : 'No parent project.'}

You have ACTIVE MUTATION TOOLS to directly manipulate this note and expand ideas onto the canvas:
- To expand or deconstruct this note into concrete connected task cards on the canvas, invoke \`expand_task(taskId: "${node.id}", subtasks: [...])\` or output a \`\`\`canvas block. This will automatically position the subtasks directly below the note and wire dependency edges.
- To convert this note into focus tasks, invoke \`expand_task\` or \`spawn_tasks\`.
- To create new sticky notes on the canvas, invoke \`spawn_notes(notes: [...])\` or output a \`\`\`canvas block.
- To update, rewrite, or set the note text and title, invoke \`update_node(nodeId: "${node.id}", text: "...", title: "...")\`.
- To append thoughts, checklists, or summaries to this note, invoke \`update_node(nodeId: "${node.id}", appendNotes: "...")\`.
- To change the background color/theme of this note, invoke \`update_node(nodeId: "${node.id}", paper: "cream" | "fog" | "bloom" | "sage")\`.
- To connect this note to other items, invoke \`connect_nodes\`.
- To remove this note, invoke \`delete_node(nodeId: "${node.id}")\`.

CRITICAL INSTRUCTIONS FOR EXPANDING ONTO CANVAS:
1. When asked to "expand", "deconstruct", "turn into tasks", or "expand note into the canvas", ALWAYS invoke \`expand_task\` or output a \`\`\`canvas block to place the subtask cards on the canvas directly below this note.
2. Only use \`update_node\` when specifically asked to edit, append, rewrite, or re-theme the note text itself.
3. Ground your subtasks and suggestions in the note content above.`
    } else if (node?.type === 'text') {
      const textData = (node.data || {}) as Record<string, any>
      systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are an AI Collaborator focused on this text element: "${textData.text || 'Untitled'}" (id: ${node.id}).
Content: "${textData.text || '(empty)'}"
To update this text, invoke \`update_node(nodeId: "${node.id}", title: "...")\` or \`update_node(nodeId: "${node.id}", text: "...")\`.`
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
- To evaluate whether this task is concrete and ready for execution or too broad, invoke \`jev_evaluate_task(taskId: "${node?.id}")\`.
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
        signal: controller.signal,
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
      const isAborted =
        err?.name === 'AbortError' ||
        err?.message?.toLowerCase().includes('aborted') ||
        controller.signal.aborted

      if (isAborted) {
        const partialText = assistantText.trim()
        if (partialText || executedToolsList.length > 0) {
          const stoppedMsg: ElementAiMessage = {
            id: `asst_${Date.now()}`,
            role: 'assistant',
            content: partialText
              ? `${partialText}\n\n*(Execution stopped)*`
              : '*(Execution stopped by user)*',
            timestamp: Date.now(),
            executedTools: executedToolsList,
          }
          saveMessages([...updated, stoppedMsg])
        }
      } else {
        const errorMsg: ElementAiMessage = {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Error: ${err.message || 'Failed to complete AI request.'}`,
          timestamp: Date.now(),
        }
        saveMessages([...updated, errorMsg])
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setActiveTool(null)
      abortControllerRef.current = null
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
  const isNote = node?.type === 'note'

  const slashCommands = useMemo(() => {
    if (isCanvasScope) {
      return [
        {
          cmd: '/runway',
          label: '/runway',
          desc: "Stage Today's Runway with top focus tasks",
          icon: <Sparkles className="size-3 text-rose-500" />,
          prompt: "Stage Today's Runway frame with the top 2-3 critical path focus tasks.",
          autoExecute: true,
        },
        {
          cmd: '/audit',
          label: '/audit',
          desc: 'Audit highest-leverage task across all projects',
          icon: <Target className="size-3 text-violet-500" />,
          prompt: 'Audit my projects and backlog: what is my single highest-leverage task today?',
          autoExecute: true,
        },
        {
          cmd: '/focus',
          label: '/focus',
          desc: 'Start 25-minute Pomodoro focus session',
          icon: <Lock className="size-3 text-blue-500" />,
          prompt: '/focus',
          autoExecute: true,
        },
      ]
    }

    if (isNote) {
      return [
        {
          cmd: '/summarize',
          label: '/summarize',
          desc: 'Summarize and polish this note into bullet points',
          icon: <Sparkles className="size-3 text-amber-500" />,
          prompt: 'Summarize and polish this note into clean bullet points.',
          autoExecute: true,
        },
        {
          cmd: '/expand',
          label: '/expand',
          desc: 'Break down into 3 concrete linked subtasks on canvas',
          icon: <Zap className="size-3 text-amber-500" />,
          prompt: '/expand',
          autoExecute: true,
        },
        {
          cmd: '/convert',
          label: '/convert',
          desc: 'Convert this note into actionable focus task cards on canvas',
          icon: <CheckSquare className="size-3 text-emerald-500" />,
          prompt: 'Deconstruct this note into 3 concrete linked subtasks on the canvas using expand_task.',
          autoExecute: true,
        },
        {
          cmd: '/rename',
          label: '/rename <title>',
          desc: 'Update this note title',
          icon: <Edit3 className="size-3 text-zinc-500" />,
          prompt: '/rename ',
          autoExecute: false,
        },
      ]
    }

    if (isTask) {
      return [
        {
          cmd: '/eval',
          label: '/eval',
          desc: 'Evaluate task actionability & blast radius (Jev)',
          icon: <Target className="size-3 text-blue-500" />,
          prompt: '/eval',
          autoExecute: true,
        },
        {
          cmd: '/expand',
          label: '/expand',
          desc: 'Break down into 3 concrete linked subtasks',
          icon: <Zap className="size-3 text-amber-500" />,
          prompt: '/expand',
          autoExecute: true,
        },
        {
          cmd: '/criteria',
          label: '/criteria',
          desc: 'Append 3 acceptance criteria checkpoints',
          icon: <CheckSquare className="size-3 text-emerald-500" />,
          prompt: '/criteria',
          autoExecute: true,
        },
        {
          cmd: '/prio',
          label: '/prio <1-4>',
          desc: 'Set priority level (1=Urgent to 4=Low)',
          icon: <Flag className="size-3 text-rose-500" />,
          prompt: '/prio 1',
          autoExecute: false,
        },
        {
          cmd: '/focus',
          label: '/focus',
          desc: 'Lock into 25-minute focus session timer',
          icon: <Lock className="size-3 text-blue-500" />,
          prompt: '/focus',
          autoExecute: true,
        },
        {
          cmd: '/stop',
          label: '/stop',
          desc: 'Exit active focus session and unlock canvas',
          icon: <X className="size-3 text-rose-500" />,
          prompt: '/stop',
          autoExecute: true,
        },
        {
          cmd: '/rename',
          label: '/rename <title>',
          desc: 'Update this task card title',
          icon: <Edit3 className="size-3 text-zinc-500" />,
          prompt: '/rename ',
          autoExecute: false,
        },
        {
          cmd: '/done',
          label: '/done',
          desc: 'Mark this task as completed',
          icon: <CheckCircle2 className="size-3 text-emerald-500" />,
          prompt: '/done',
          autoExecute: true,
        },
      ]
    }

    return [
      {
        cmd: '/eval',
        label: '/eval',
        desc: 'Evaluate project milestone execution readiness (Jev)',
        icon: <Target className="size-3 text-emerald-500" />,
        prompt: '/eval',
        autoExecute: true,
      },
      {
        cmd: '/expand',
        label: '/expand',
        desc: 'Generate sequential 4-step task workflow',
        icon: <Zap className="size-3 text-amber-500" />,
        prompt: 'Generate a sequential 4-step task workflow to launch this project milestone.',
        autoExecute: true,
      },
      {
        cmd: '/criteria',
        label: '/criteria',
        desc: 'List key deliverables and success metrics',
        icon: <CheckSquare className="size-3 text-emerald-500" />,
        prompt: 'List the key deliverables and success metrics for this project.',
        autoExecute: true,
      },
      {
        cmd: '/rename',
        label: '/rename <title>',
        desc: 'Update project frame title',
        icon: <Edit3 className="size-3 text-zinc-500" />,
        prompt: '/rename ',
        autoExecute: false,
      },
    ]
  }, [isCanvasScope, isTask, isNote])

  const showSlashMenu = prompt.startsWith('/') && !prompt.includes(' ') && !prompt.includes('\n')
  const matchingCommands = useMemo(() => {
    if (!showSlashMenu) return []
    const q = prompt.toLowerCase()
    return slashCommands.filter((c) => c.cmd.toLowerCase().startsWith(q))
  }, [showSlashMenu, slashCommands, prompt])

  useEffect(() => {
    setSelectedCmdIndex(0)
  }, [prompt])

  const applySlashCommand = useCallback(
    (cmdItem: (typeof slashCommands)[0]) => {
      if (cmdItem.autoExecute) {
        handleSend(cmdItem.prompt)
      } else {
        setPrompt(cmdItem.prompt)
        setTimeout(() => textareaRef.current?.focus(), 10)
      }
    },
    [handleSend]
  )

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

          {/* AI Provider & Model Fast Switcher Pill */}
          <Popover open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  title={
                    isAiReady
                      ? `Active AI: ${activeConfig.provider.toUpperCase()} (${activeModelLabel})`
                      : activeConfig.provider === 'ollama'
                      ? 'Ollama is offline (start localhost:11434)'
                      : `${activeConfig.provider.toUpperCase()} API key missing`
                  }
                  className={`h-6 px-2 rounded-full border text-[10px] font-medium transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ${
                    isAiReady
                      ? 'border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-200 hover:border-black/20 dark:hover:border-white/20'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                  }`}
                />
              }
            >
              <span
                className={`size-1.5 rounded-full shrink-0 ${
                  isAiReady ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span className="truncate max-w-[85px] font-mono text-[10px]">
                {activeConfig.provider === 'openai'
                  ? 'OpenAI'
                  : activeConfig.provider === 'gemini'
                  ? 'Gemini'
                  : 'Ollama'}
                : {activeModelLabel}
              </span>
              <ChevronDown className="size-2.5 text-zinc-400 shrink-0" />
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={6}
              className="w-72 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-2xl text-zinc-900 dark:text-zinc-100 z-[7000] font-sans space-y-2 select-none"
            >
              <div className="flex items-center justify-between px-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Cpu className="size-3 text-blue-500" />
                  <span>AI Provider & Model</span>
                </span>
                <span className={`text-[10px] ${isAiReady ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {isAiReady ? 'Online' : 'Needs Config'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-0.5 rounded-full text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectProvider('ollama')}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer text-center ${
                    activeConfig.provider === 'ollama'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Ollama
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProvider('openai')}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer text-center ${
                    activeConfig.provider === 'openai'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  OpenAI
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectProvider('gemini')}
                  className={`py-1 px-1.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer text-center ${
                    activeConfig.provider === 'gemini'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  Gemini
                </button>
              </div>

              {activeConfig.provider === 'openai' && (
                <div className="space-y-1.5 pt-0.5">
                  {!settings.openaiApiKey?.trim() ? (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                      <p className="font-semibold">OpenAI API Key Missing</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Configure in Foqz Settings &rarr; AI to use OpenAI models.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {OPENAI_DEFAULT_MODELS.map((m) => {
                        const isSelected = activeConfig.model === m
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              handleSelectModel('openai', m)
                              setModelMenuOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span className="font-mono text-[11px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeConfig.provider === 'gemini' && (
                <div className="space-y-1.5 pt-0.5">
                  {!settings.geminiApiKey?.trim() ? (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-[11px] text-amber-800 dark:text-amber-300">
                      <p className="font-semibold">Gemini API Key Missing</p>
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Configure in Foqz Settings &rarr; AI to use Gemini models.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {GEMINI_DEFAULT_MODELS.map((m) => {
                        const isSelected = activeConfig.model === m
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              handleSelectModel('gemini', m)
                              setModelMenuOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span className="font-mono text-[11px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {activeConfig.provider === 'ollama' && (
                <div className="space-y-1 pt-0.5">
                  {!online ? (
                    <div className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-300 text-center">
                      <p className="font-semibold text-rose-600 dark:text-rose-400">Ollama Offline</p>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Start Ollama with <code className="font-mono bg-zinc-200/60 dark:bg-zinc-700 px-1 py-0.5 rounded">ollama serve</code>
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                      {models.map((m) => {
                        const isSelected = selectedModel === m
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              handleSelectModel('ollama', m)
                              setModelMenuOpen(false)
                            }}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100 font-medium'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300'
                            }`}
                          >
                            <span className="font-mono text-[11px] truncate max-w-[200px]">{m}</span>
                            {isSelected && <Check className="size-3 text-blue-600 dark:text-blue-400" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {isStreaming && (
            <button
              type="button"
              onClick={handleStop}
              title="Stop agent execution (Esc)"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/50 transition-colors cursor-pointer active:scale-95 shrink-0"
            >
              <Square className="size-2.5 fill-current" />
              <span>Stop</span>
            </button>
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
            onClick={() => {
              handleStop()
              onClose()
            }}
            title="Close chat (Esc)"
            className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Active Node Control Strip */}
      <ActiveNodeControlStrip nodeId={nodeId} isCanvasScope={isCanvasScope} />

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
                    onClick={() => handleSend('/eval')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Target className="size-3 text-blue-500" />
                    <span>🎯 Evaluate Actionability</span>
                  </button>
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
                    onClick={() => handleSend('/eval')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Target className="size-3 text-emerald-500" />
                    <span>🎯 Evaluate Readiness</span>
                  </button>
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
              {isNote && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSend('/summarize')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles className="size-3 text-amber-500" />
                    <span>✨ Summarize & Polish</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Expand on the ideas in this note with deep brainstorming and concrete next steps.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    💡 Brainstorm & Expand
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSend('Convert the main points in this note into 3 actionable focus tasks using spawn_tasks.')}
                    className="px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 text-[11px] transition-colors cursor-pointer"
                  >
                    ⚡ Convert to Tasks
                  </button>
                </>
              )}
              {!isTask && !isProject && !isNote && (
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
                      const hasJevInTools = m.executedTools?.some(
                        (evt) => evt.toolName === 'jev_evaluate_task'
                      )
                      const isJevEval =
                        !hasJevInTools &&
                        isTask &&
                        (seg.content.includes('Evaluation Verdict') ||
                          (seg.content.includes('Actionable') && seg.content.includes('Blast Radius')))
                      if (isJevEval) {
                        return (
                          <div key={sIdx} className="space-y-2">
                            <JevEvaluationCard
                              content={seg.content}
                              onDeconstruct={() => handleSend('/expand')}
                              onFocus={() => handleSend('/focus')}
                            />
                            <MarkdownView content={seg.content} />
                          </div>
                        )
                      }
                      return <MarkdownView key={sIdx} content={seg.content} />
                    }
                    if (seg.type === 'canvas') {
                      return (
                        <CanvasActionList
                          key={sIdx}
                          actions={seg.actions}
                          parentTask={isTask && node ? { id: node.id, title: currentShapeText } : null}
                          onSpawnAll={(options) => handleSpawn(seg.actions, options)}
                          onSpawnSingle={handleSpawnSingle}
                          spawnedCount={spawnedCount}
                        />
                      )
                    }
                    if (seg.type === 'proposed-update') {
                      return (
                        <ProposedUpdateCard
                          key={sIdx}
                          update={seg.update}
                          activeNodeId={node?.id}
                        />
                      )
                    }
                    return null
                  })}

                  {/* Executed Tools Diffs & Jev Evaluations */}
                  {m.executedTools && m.executedTools.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {m.executedTools
                        .filter((evt) => evt.toolName === 'update_node')
                        .map((evt, eIdx) => (
                          <ExecutedToolDiffCard
                            key={eIdx}
                            toolCall={evt}
                            nodeId={node?.id}
                          />
                        ))}

                      {m.executedTools
                        .filter((evt) => evt.toolName === 'jev_evaluate_task' || evt.toolName === 'jev_evaluate_project')
                        .map((evt, eIdx) => {
                          const evalText =
                            evt.result?.content?.find((c) => c.type === 'text')?.text || ''
                          return (
                            <JevEvaluationCard
                              key={eIdx}
                              content={evalText}
                              onDeconstruct={() => handleSend('/expand')}
                              onFocus={() => handleSend('/focus')}
                            />
                          )
                        })}
                    </div>
                  )}

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

        {isStreaming && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs border border-blue-200/60 dark:border-blue-800/60 animate-in fade-in duration-150 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              {activeTool ? (
                <>
                  <Wrench className="size-3.5 animate-spin shrink-0 text-blue-500" />
                  <span className="font-mono text-[11px] truncate">Calling tool: {activeTool}...</span>
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                  <span className="text-[11px] truncate">
                    Thinking with {activeModelLabel}...
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/50 transition-colors cursor-pointer shrink-0 active:scale-95"
              title="Stop agent execution (Esc)"
            >
              <Square className="size-2.5 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="p-2.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.02] shrink-0 space-y-1.5 relative">
        {/* Slash Command Autocomplete Popover */}
        {showSlashMenu && matchingCommands.length > 0 && (
          <div className="absolute bottom-[52px] left-2.5 right-2.5 max-h-56 overflow-y-auto bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.04] mb-1">
              <span>Commands</span>
              <span className="font-mono text-[9px] text-zinc-400">↑↓ navigate • ↲ select • esc</span>
            </div>
            {matchingCommands.map((item, idx) => {
              const isSelected = idx === selectedCmdIndex
              return (
                <button
                  key={item.cmd}
                  type="button"
                  onMouseEnter={() => setSelectedCmdIndex(idx)}
                  onClick={() => applySlashCommand(item)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 text-blue-900 dark:text-blue-100 font-medium'
                      : 'hover:bg-black/5 dark:hover:bg-white/5 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {item.icon}
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {item.desc}
                    </span>
                  </div>
                  {isSelected && (
                    <kbd className="hidden sm:inline-flex text-[9px] font-mono px-1 py-0.2 rounded bg-black/5 dark:bg-white/10 text-zinc-400">
                      ↲
                    </kbd>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {isTask && !isStreaming && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button
              type="button"
              onClick={() => handleSend('/eval')}
              className="px-2 py-0.5 rounded-full border border-black/10 dark:border-white/10 bg-white/60 dark:bg-zinc-800/60 hover:bg-white dark:hover:bg-zinc-700 text-[10px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1"
            >
              <Target className="size-2.5 text-blue-500" />
              <span>Evaluate</span>
            </button>
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
              if (showSlashMenu && matchingCommands.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSelectedCmdIndex((prev) => (prev + 1) % matchingCommands.length)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSelectedCmdIndex((prev) => (prev - 1 + matchingCommands.length) % matchingCommands.length)
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  const target = matchingCommands[selectedCmdIndex] || matchingCommands[0]
                  if (target) {
                    applySlashCommand(target)
                  }
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setPrompt('')
                  return
                }
              }

              if (e.key === 'Escape') {
                if (isStreaming) {
                  e.preventDefault()
                  handleStop()
                  return
                }
              }

              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder={`Ask about "${currentShapeText.slice(0, 20)}..." or type / for commands`}
            rows={1}
            className="flex-1 bg-transparent border-0 outline-none resize-none text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 leading-relaxed font-sans max-h-24"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              title="Stop agent execution (Esc)"
              aria-label="Stop agent execution"
              className="size-7 rounded-full bg-zinc-900 hover:bg-rose-600 active:scale-95 text-white dark:bg-zinc-100 dark:hover:bg-rose-600 dark:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!prompt.trim()}
              title="Send message (Enter)"
              aria-label="Send message"
              className="size-7 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white disabled:opacity-30 disabled:hover:bg-blue-600 flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <ArrowUp className="size-3.5 stroke-[2.5]" />
            </button>
          )}
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
