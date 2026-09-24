import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  type Editor,
  type TLShape,
  type TLShapeId,
  createShapeId,
  useValue,
} from 'tldraw'
import {
  Sparkles,
  Send,
  ArrowUp,
  X,
  Plus,
  Layers,
  ArrowRight,
  CornerDownRight,
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
  RotateCcw,
  Trash2,
  Check,
  BookOpen,
  ListTodo,
  CheckCircle2,
  AlertTriangle,
  Search,
} from 'lucide-react'
import { extractTextFromShape } from '@/lib/canvasContext'
import { useOllama } from '@/lib/ollama'
import { type AiChatMessage } from '@/lib/aiProvider'
import { useFocusAppSettingsOptional } from '@/context/FocusAppSettingsContext'
import { getCachedAppSettings } from '@/lib/appSettingsCache'
import { resolveActiveAiConfig } from '@/lib/appSettings'
import { evaluateJev } from '@/lib/jev'
import { runAgentLoop, type AgentToolCallEvent } from '@/lib/mcpAgentLoop'
import { NATIVE_FOQZ_TOOLS, createCanvasToolExecutor } from '@/lib/canvasTools'
import {
  FOQZ_SYSTEM_PROMPT,
  findContainingProjectFrame,
  parseCanvasActions,
  parseOutputSegments,
  spawnShapesOnCanvas,
  spawnSingleShapeOnCanvas,
  spawnWorkflowForProject,
  type SpawnableShape,
} from '@/lib/canvasSpawner'
import type { McpTool } from '@/lib/mcpTypes'
import type { TLProjectFrameShape } from '@/shapes/projectFrame/ProjectFrameShapeUtil'
import { MarkdownView } from '@/components/MarkdownView'
import { CanvasActionList } from '@/components/CanvasActionList'

export interface ElementAiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  executedTools?: AgentToolCallEvent[]
  activeTool?: string | null
}

export interface ElementAiSession {
  messages: ElementAiMessage[]
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
  editor: Editor | null
  shapeId: TLShapeId | null
  onClose: () => void
}

export function ElementInlineChat({ editor, shapeId, onClose }: ElementInlineChatProps) {
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [mcpTools, setMcpTools] = useState<McpTool[]>([])
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const { selectedModel, online } = useOllama()
  const appSettingsCtx = useFocusAppSettingsOptional()
  const settings = appSettingsCtx?.settings || getCachedAppSettings()
  const activeConfig = resolveActiveAiConfig(settings)
  const isAiReady =
    activeConfig.isConfigured &&
    (activeConfig.provider !== 'ollama' || online)

  // Draggable and Resizable state
  const DEFAULT_WIDTH = 460
  const DEFAULT_HEIGHT = 520
  const MIN_WIDTH = 340
  const MIN_HEIGHT = 280

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

  // Reset custom position and maximize when switching shapes
  useEffect(() => {
    setCustomPos(null)
    setIsMaximized(false)
  }, [shapeId])

  // Clamp modal within screen bounds on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      setModalSize((prev) => ({
        width: Math.min(prev.width, window.innerWidth - 24),
        height: Math.min(prev.height, window.innerHeight - 60),
      }))
      setCustomPos((prev) => {
        if (!prev) return null
        return {
          x: Math.max(12, Math.min(Math.max(12, window.innerWidth - 120), prev.x)),
          y: Math.max(48, Math.min(Math.max(48, window.innerHeight - 80), prev.y)),
        }
      })
    }
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [])

  // Track the active shape and its position in screen coordinates
  const shape = useValue('selected shape for chat', () => {
    if (!editor || !shapeId) return null
    return editor.getShape(shapeId)
  }, [editor, shapeId])

  // Fetch MCP tools and listen for updates
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

  // Resolve containing project frame for this shape
  const containingProject = useMemo(() => {
    if (!editor || !shape) return null
    return findContainingProjectFrame(editor, shape)
  }, [editor, shape])

  // Resolve connected repository for this shape or parent project frame
  const connectedRepo = useMemo(() => {
    if (!editor || !shape) return null

    if (containingProject?.props.connectors?.githubRepo) {
      return containingProject.props.connectors.githubRepo
    }

    // 1. Direct project frame shape
    if (shape.type === 'project-frame') {
      const pf = shape as TLProjectFrameShape
      if (pf.props.connectors?.githubRepo) {
        return pf.props.connectors.githubRepo
      }
    }

    // 2. Child of a project frame
    if (shape.parentId) {
      const parent = editor.getShape(shape.parentId)
      if (parent && parent.type === 'project-frame') {
        const pf = parent as TLProjectFrameShape
        if (pf.props.connectors?.githubRepo) {
          return pf.props.connectors.githubRepo
        }
      }
    }

    // 3. Coordinate containment inside a project frame
    const pageShapes = editor.getCurrentPageShapes()
    for (const s of pageShapes) {
      if (s.type === 'project-frame') {
        const pf = s as TLProjectFrameShape
        if (
          shape.x >= pf.x &&
          shape.x <= pf.x + pf.props.w &&
          shape.y >= pf.y &&
          shape.y <= pf.y + pf.props.h
        ) {
          if (pf.props.connectors?.githubRepo) {
            return pf.props.connectors.githubRepo
          }
        }
      }
    }

    // 4. Any project frame on the page with a connected repo
    for (const s of pageShapes) {
      if (s.type === 'project-frame') {
        const pf = s as TLProjectFrameShape
        if (pf.props.connectors?.githubRepo) {
          return pf.props.connectors.githubRepo
        }
      }
    }

    // 5. Fallback workspace repo
    return 'yhauxell/foqz'
  }, [editor, shape])

  // Compute smart viewport placement to fit directly on the side of the element
  const placement = useValue('shape screen placement', () => {
    if (!editor || !shapeId) return null
    const pageBounds = editor.getShapePageBounds(shapeId)
    if (!pageBounds) return null

    const minScreen = editor.pageToViewport({ x: pageBounds.minX, y: pageBounds.minY })
    const maxScreen = editor.pageToViewport({ x: pageBounds.maxX, y: pageBounds.maxY })

    const shapeLeft = minScreen.x
    const shapeRight = maxScreen.x
    const shapeTop = minScreen.y
    const shapeBottom = maxScreen.y
    const shapeHeight = shapeBottom - shapeTop

    const CHAT_WIDTH = modalSize.width
    const CHAT_HEIGHT = modalSize.height
    const GAP = 12
    const TOPBAR_HEIGHT = 52
    const MARGIN = 12

    // Check horizontal space on screen
    const spaceRight = window.innerWidth - shapeRight
    const spaceLeft = shapeLeft

    let x: number
    let side: 'right' | 'left' = 'right'

    if (spaceRight >= CHAT_WIDTH + GAP + MARGIN) {
      // Preferred: fit to the right side of element
      x = shapeRight + GAP
      side = 'right'
    } else if (spaceLeft >= CHAT_WIDTH + GAP + MARGIN) {
      // Fallback: fit to the left side of element when right side is off-screen
      x = shapeLeft - CHAT_WIDTH - GAP
      side = 'left'
    } else {
      // If element is very wide (e.g. project frame), dock inside the right edge of the frame
      if (shapeRight - shapeLeft > CHAT_WIDTH + 40) {
        x = Math.min(window.innerWidth - CHAT_WIDTH - MARGIN, shapeRight - CHAT_WIDTH - GAP)
        side = 'right'
      } else {
        // Place on whichever side has more space
        x = spaceRight > spaceLeft
          ? Math.max(MARGIN, window.innerWidth - CHAT_WIDTH - MARGIN)
          : MARGIN
        side = spaceRight > spaceLeft ? 'right' : 'left'
      }
    }

    // Vertical alignment: align with top of element (or slightly higher for small shapes)
    let y = shapeTop
    if (shapeHeight < 100) {
      y = shapeTop - 20
    }

    // Clamp Y to viewport
    const minY = TOPBAR_HEIGHT + 8
    const maxY = Math.max(minY, window.innerHeight - CHAT_HEIGHT - MARGIN)
    y = Math.max(minY, Math.min(maxY, y))

    return {
      x,
      y,
      side,
    }
  }, [editor, shapeId, modalSize.width, modalSize.height])

  const currentX = customPos ? customPos.x : (placement?.x ?? 80)
  const currentY = customPos ? customPos.y : (placement?.y ?? 80)

  // Dragging the header to reposition modal anywhere on screen
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Ignore clicks on buttons, inputs, links, or controls
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) {
      return
    }
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

  // Resizing edges and corners
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

  // Toggle expand / restore
  const toggleMaximize = () => {
    if (!isMaximized) {
      preMaximizeRef.current = {
        pos: customPos,
        size: modalSize,
      }
      const pad = 24
      const topPad = 60
      const w = Math.min(840, window.innerWidth - pad * 2)
      const h = Math.min(740, window.innerHeight - topPad - pad)
      const x = Math.max(pad, (window.innerWidth - w) / 2)
      const y = topPad
      setCustomPos({ x: Math.round(x), y: Math.round(y) })
      setModalSize({ width: Math.round(w), height: Math.round(h) })
      setIsMaximized(true)
    } else {
      if (preMaximizeRef.current) {
        setCustomPos(preMaximizeRef.current.pos)
        setModalSize(preMaximizeRef.current.size)
      }
      setIsMaximized(false)
    }
  }

  // Extract session messages from shape.meta.aiSession
  const session: ElementAiSession = (shape?.meta?.aiSession as ElementAiSession) || { messages: [] }
  const messages = session.messages || []

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Auto-scroll on message updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [shapeId])

  // Extract graph topology (arrows connected to this shape)
  const graphContext = useValue('graph topology context', () => {
    if (!editor || !shapeId) return { incoming: [], outgoing: [] }
    const incoming: string[] = []
    const outgoing: string[] = []

    try {
      // 1. Check tldraw arrow bindings
      const arrowBindings = (editor.getBindingsToShape ? editor.getBindingsToShape(shapeId, 'arrow') : []) as any[]
      for (const b of arrowBindings) {
        const arrowShape = editor.getShape(b.fromId)
        if (!arrowShape) continue
        const arrowBindingsOnShape = (editor.getBindingsFromShape ? editor.getBindingsFromShape(arrowShape.id, 'arrow') : []) as any[]

        if (b.props?.terminal === 'end') {
          const startBinding = arrowBindingsOnShape.find((x: any) => x.props?.terminal === 'start')
          if (startBinding?.toId) {
            const startShape = editor.getShape(startBinding.toId)
            if (startShape) incoming.push(extractTextFromShape(startShape) || `[${startShape.type}]`)
          }
        } else if (b.props?.terminal === 'start') {
          const endBinding = arrowBindingsOnShape.find((x: any) => x.props?.terminal === 'end')
          if (endBinding?.toId) {
            const endShape = editor.getShape(endBinding.toId)
            if (endShape) outgoing.push(extractTextFromShape(endShape) || `[${endShape.type}]`)
          }
        }
      }
    } catch {
      // Fallback to geometric scan
    }

    // 2. Fallback check for arrow shapes directly
    if (incoming.length === 0 && outgoing.length === 0) {
      const pageShapes = editor.getCurrentPageShapes()
      for (const s of pageShapes) {
        if (s.type === 'arrow') {
          const props = (s.props || {}) as Record<string, any>
          const startId = props.start?.boundShapeId
          const endId = props.end?.boundShapeId

          if (endId === shapeId && startId) {
            const startShape = editor.getShape(startId)
            if (startShape) incoming.push(extractTextFromShape(startShape) || `[${startShape.type}]`)
          } else if (startId === shapeId && endId) {
            const endShape = editor.getShape(endId)
            if (endShape) outgoing.push(extractTextFromShape(endShape) || `[${endShape.type}]`)
          }
        }
      }
    }

    return { incoming, outgoing }
  }, [editor, shapeId])

  const currentShapeText = shape ? extractTextFromShape(shape) : ''

  // Save session back to shape.meta
  const saveMessages = useCallback(
    (newMessages: ElementAiMessage[]) => {
      if (!editor || !shapeId || !shape) return
      editor.updateShape({
        id: shape.id,
        type: shape.type,
        meta: {
          ...shape.meta,
          aiSession: {
            messages: newMessages,
          },
        },
      })
    },
    [editor, shapeId, shape]
  )

  // Canvas element spawner helpers
  const [spawnedCount, setSpawnedCount] = useState<number | null>(null)

  const handleSpawn = useCallback(
    (actions: SpawnableShape[]) => {
      if (!editor || !shape || !actions.length) return
      let count = 0
      const targetProject = findContainingProjectFrame(editor, shape)
      if (targetProject) {
        count = spawnWorkflowForProject(
          editor,
          targetProject,
          actions,
        )
      } else {
        count = spawnShapesOnCanvas(editor, shape, actions)
      }
      setSpawnedCount(count)
      setTimeout(() => setSpawnedCount(null), 3000)
    },
    [editor, shape]
  )

  const handleSpawnSingle = useCallback(
    (action: SpawnableShape, index: number) => {
      if (!editor || !shape) return
      const targetProject = findContainingProjectFrame(editor, shape)
      if (targetProject) {
        spawnWorkflowForProject(editor, targetProject, [action])
      } else {
        spawnSingleShapeOnCanvas(editor, action, shape, index)
      }
    },
    [editor, shape]
  )

  // Clear chat conversation for this element
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
    if (!text || !editor || !shape || isStreaming) return

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

    // Ensure latest MCP tools are fetched
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
    const localToolExecutor = createCanvasToolExecutor(editor, () => shape)

    const [repoOwner, repoName] = connectedRepo && connectedRepo.includes('/')
      ? connectedRepo.split('/')
      : ['', connectedRepo || '']

    const projectContext = containingProject?.props.projectContext
    const projectTitle = containingProject?.props.title || 'Untitled Project'
    const projectGoal = containingProject?.props.goal || ''

    let systemPrompt = `${FOQZ_SYSTEM_PROMPT}

You are an AI thinking partner and autonomous agent embedded inside Foqz, focused on a specific canvas element.
Current Element: "${currentShapeText}" (type: ${shape.type})
${connectedRepo ? `Connected GitHub Repository: "${connectedRepo}". When asked about issues, pull requests, files, or commits, ALWAYS invoke the appropriate GitHub MCP tool (e.g. github__search_issues, github__list_issues, github__get_issue, etc.) with owner="${repoOwner}" and repo="${repoName}".` : ''}
${projectContext ? `
PROJECT CONTEXT & REPOSITORY ARCHITECTURE:
Project: "${projectTitle}"${projectGoal ? ` (Goal: "${projectGoal}")` : ''}
Context & Guidelines:
${projectContext}
(Ground all suggestions, code patterns, and task breakdowns in this project architecture!)
` : ''}

You have FULL ACCESS to Model Context Protocol (MCP) tools for GitHub and native Foqz canvas tools:
- \`spawn_tasks\`: Create actionable task cards directly on the canvas connected to this element.
- \`create_timer\`: Create a focus countdown timer on the canvas.
- \`add_sticky_note\`: Add a sticky note with tips or thoughts on the canvas.
- \`get_canvas_summary\`: Inspect the current canvas shapes.

INTERNAL TOOLS & CANVAS ELEMENT GENERATION:
When the user asks to break down this element, create tasks, add subtasks, add notes, or generate elements:
1. You can call internal tools directly (e.g. \`spawn_tasks\`, \`add_sticky_note\`, \`create_timer\`).
2. OR you can include a \`\`\`canvas block containing a JSON array of shapes:
\`\`\`canvas
[
  { "type": "task", "title": "Concrete task title", "priority": 1 },
  { "type": "task", "title": "Second task title", "priority": 2 },
  { "type": "note", "text": "Helpful note or hint", "color": "yellow" }
]
\`\`\`
The inline chat interface will automatically parse the JSON and display an interactive "Spawn All" element list to immediately place the shapes on the board connected to this element!

TYPESAFE JEV SYSTEM ONE TRIAGE & PRIORITIZATION:
You have access to the \`jev_triage_items\` native tool:
- When the user asks to triage, prioritize, or rank issues, PRs, bugs, or feature ideas against board priorities:
  1. ALWAYS invoke \`jev_triage_items\` with the candidate items ({ title, description, id }) and optional criteria. Jev evaluates strategic alignment with the canvas, blast radius/risk, and actionability.
  2. Present the triaged rankings clearly with their priority (P1 for urgent blockers / high leverage, P2 for medium, P3 for supporting tasks).
  3. Proactively provide a \`\`\`canvas block containing the prioritized task cards (P1, P2, P3).
- This completes the recommended end-to-end workflow:
  Get Issues (GitHub MCP) -> Triage & Prioritize (Jev System One) -> Propose Tasks (Canvas block) -> Spawn All to Canvas -> Focus on Top Item!

CRITICAL: When the user asks to check issues, list PRs, search code, or inspect repository data, YOU MUST INVOKE THE RELEVANT MCP TOOL instead of giving generic hypothetical instructions!
When you receive tool execution results, summarize the real issues or data clearly and concisely for the user.`

    let canvasContext = `[Target Element Context]\nElement Text: "${currentShapeText}"\nShape Type: ${shape.type}`
    if (containingProject) {
      canvasContext += `\nBelongs to Project Frame: "${projectTitle}"${projectGoal ? ` (Goal: "${projectGoal}")` : ''}`
      if (projectContext) {
        canvasContext += `\nProject Context & Architecture: ${projectContext.slice(0, 600)}${projectContext.length > 600 ? '...' : ''}`
      }
    }
    if (connectedRepo) {
      canvasContext += `\nConnected GitHub Repo: ${connectedRepo}`
    }
    if (graphContext.incoming.length > 0) {
      canvasContext += `\nPrerequisites / Parent items (incoming arrows): ${graphContext.incoming.join(', ')}`
    }
    if (graphContext.outgoing.length > 0) {
      canvasContext += `\nSubsequent / Dependent items (outgoing arrows): ${graphContext.outgoing.join(', ')}`
    }

    const previousHistory: AiChatMessage[] = updated.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }))

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
        canvasContext,
        defaultRepo: connectedRepo || undefined,
        conversationHistory: previousHistory,
        tools: allTools,
        localToolExecutor,
        onChunk: (delta) => {
          setStreamingContent((prev) => prev + delta)
        },
        onToolCallStart: (evt) => {
          const toolLabel = `${evt.serverName || 'mcp'}:${evt.toolName}`
          setActiveTool(toolLabel)
          setStreamingContent('')
        },
        onToolCallEnd: (evt) => {
          executedToolsList.push(evt)
          setActiveTool(null)
        },
      })

      const assistantMsg: ElementAiMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: result.finalText,
        timestamp: Date.now(),
        executedTools: result.executedTools.length > 0 ? result.executedTools : executedToolsList,
      }
      saveMessages([...updated, assistantMsg])
    } catch (err: any) {
      let friendlyError = err?.message || 'Failed to get response from AI.'
      if (
        activeConfig.provider === 'ollama' &&
        (!online ||
          friendlyError.includes('Failed to fetch') ||
          friendlyError.includes('NetworkError') ||
          friendlyError.includes('connection refused'))
      ) {
        friendlyError = `Local AI (Ollama) is currently offline.\n\nTo brainstorm with local AI, run \`ollama serve\` in your terminal or configure OpenAI / Gemini in Settings.`
        if (text.toLowerCase().includes('deconstruct')) {
          friendlyError += `\n\nFallback breakdown for "${currentShapeText}":\n1. Define interface & core schema\n2. Implement core functionality\n3. Test edge cases & verification\n\n(Click "Spawn to Canvas" below to add these to your board)`
        }
      }
      const errorMsg: ElementAiMessage = {
        id: `assistant_err_${Date.now()}`,
        role: 'assistant',
        content: friendlyError,
        timestamp: Date.now(),
        executedTools: executedToolsList,
      }
      saveMessages([...updated, errorMsg])
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      setActiveTool(null)
    }
  }

  // Action: Jev System One evaluation
  const handleJevAudit = async () => {
    if (!editor || !shape || isStreaming) return
    setIsStreaming(true)
    setStreamingContent('Evaluating element priorities...')

    const userMsg: ElementAiMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: 'Audit this item: actionability, strategic leverage, and risk profile.',
      timestamp: Date.now(),
    }
    const updated = [...messages, userMsg]
    saveMessages(updated)

    try {
      const state = {
        element_text: currentShapeText,
        element_type: shape.type,
        connected_prerequisites: graphContext.incoming,
        connected_dependents: graphContext.outgoing,
      }

      const questions = {
        actionable: {
          type: 'noul' as const,
          instructions: `Is "${currentShapeText}" a concrete, self-contained next step that can be built or executed directly without ambiguity?`,
        },
        impact: {
          type: 'score' as const,
          instructions: `What is the leverage or business impact of completing "${currentShapeText}" for an indie hacker / solopreneur?`,
          criteria: [
            'Trivial busywork or premature optimization',
            'Helpful secondary task or maintenance',
            'Core high-leverage deliverable or customer-facing milestone',
          ],
        },
        risk: {
          type: 'choice' as const,
          instructions: `What is the risk or blast radius category of "${currentShapeText}"?`,
          criteria: {
            low_risk: 'Self-contained tweak, easily reversible',
            medium_risk: 'Multi-component change or internal refactor',
            high_risk: 'Architecture overhaul or external dependency risk',
          },
        },
      }

      const res = await evaluateJev({ state, questions })
      const actionableProb = (res.answers.actionable as any)?.noul ?? 0.5
      const isActionable = actionableProb >= 0.5
      const impactScore = (res.answers.impact as any)?.score ?? 1
      const riskChoice = (res.answers.risk as any)?.choice || 'medium_risk'

      const assistantMsg: ElementAiMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: `**Priority & Actionability Evaluation**\n\n• **Actionable**: ${isActionable ? 'Yes' : 'Ambiguous'} (${Math.round(actionableProb * 100)}% probability)\n• **Strategic Impact**: ${impactScore}/2 — ${impactScore === 2 ? 'High-leverage milestone' : impactScore === 1 ? 'Helpful supporting task' : 'Low leverage / distraction'}\n• **Blast Radius**: \`${riskChoice}\`\n\n${!isActionable ? '*Tip: Click "Deconstruct" to break this down into smaller steps.*' : '*Ready to build. Press "f" on the canvas to focus on this.*'}`,
        timestamp: Date.now(),
      }
      saveMessages([...updated, assistantMsg])
    } catch (err: any) {
      const errorMsg: ElementAiMessage = {
        id: `assistant_err_${Date.now()}`,
        role: 'assistant',
        content: `Evaluation: ${err.message || 'Evaluation failed. Make sure your TypeSafe API key is configured in Foqz Settings.'}`,
        timestamp: Date.now(),
      }
      saveMessages([...updated, errorMsg])
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
    }
  }

  // Action: Spawn cards/tasks directly on canvas connected to this element
  const handleSpawnChildren = useCallback(() => {
    if (!editor || !shape) return

    // 1. Search backwards through assistant messages for structured canvas actions
    let actionsToSpawn: SpawnableShape[] = []
    const assistantMessages = [...messages].filter((m) => m.role === 'assistant').reverse()
    for (const msg of assistantMessages) {
      const parsed = parseCanvasActions(msg.content)
      if (parsed.length > 0) {
        actionsToSpawn = parsed
        break
      }
    }

    // 2. If no structured canvas block found, extract bulleted/numbered items from latest assistant message
    if (actionsToSpawn.length === 0) {
      const lastAssistant = assistantMessages[0]
      if (!lastAssistant) return

      const lines = lastAssistant.content.split('\n')
      const stepLines = lines
        .map((l) => l.replace(/^[\d\-\*\•\.\s\(\)]+/, '').trim())
        .filter(
          (l) =>
            l.length > 3 &&
            l.length < 120 &&
            !l.startsWith('#') &&
            !l.startsWith('http') &&
            !l.startsWith('```')
        )
        .slice(0, 5)

      const items = stepLines.length > 0 ? stepLines : ['Sub-step 1', 'Sub-step 2']
      actionsToSpawn = items.map((title, idx) => ({
        type: 'task',
        title,
        priority: idx === 0 ? 1 : idx === 1 ? 2 : 3,
      }))
    }

    if (actionsToSpawn.length === 0) return
    handleSpawn(actionsToSpawn)
  }, [editor, shape, messages, handleSpawn])

  if (!shape || (!placement && !customPos)) return null

  return (
    <div
      style={{
        left: currentX,
        top: currentY,
        width: modalSize.width,
        height: modalSize.height,
        maxHeight: 'calc(100vh - 40px)',
        maxWidth: 'calc(100vw - 20px)',
      }}
      className={`fixed z-[6500] rounded-[28px] bg-white dark:bg-zinc-950 border border-zinc-200/90 dark:border-zinc-800 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100 ${
        isDragging || isResizing ? 'select-none' : ''
      }`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header (Drag handle & shadcn-style title bar) */}
      <div
        onPointerDown={handleHeaderPointerDown}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, input, a, [role="button"]')) {
            toggleMaximize()
          }
        }}
        className={`flex items-center justify-between px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/70 bg-white/70 dark:bg-zinc-950/70 select-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        title="Drag to move • Double-click to expand/restore"
      >
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate tracking-tight">
              {currentShapeText ? currentShapeText.slice(0, 36) : 'New Chat'}
            </span>

            {connectedRepo && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('foqz:open-project-connectors', {
                      detail: { shapeId: containingProject?.id || shapeId, initialTab: 'connectors' },
                    }),
                  )
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0 cursor-pointer"
                title={`Connected GitHub Repo: ${connectedRepo}. Click to configure connectors.`}
              >
                <GitBranch className="size-2.5 text-blue-600 dark:text-blue-400" />
                <span className="truncate max-w-[90px]">{connectedRepo}</span>
              </button>
            )}

            {containingProject?.props.projectContext && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('foqz:open-project-connectors', {
                      detail: { shapeId: containingProject.id, initialTab: 'context' },
                    }),
                  )
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0 cursor-pointer"
                title={`Project Context active (${containingProject.props.projectContext.length} chars). Click to view or edit.`}
              >
                <BookOpen className="size-2.5 text-zinc-500" />
                <span>Context</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            <span>How can I help you today?</span>
            <span className="inline-block size-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${
                isAiReady ? 'text-zinc-500 dark:text-zinc-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  isAiReady ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {isAiReady
                ? activeConfig.provider === 'openai'
                  ? 'OpenAI'
                  : activeConfig.provider === 'gemini'
                  ? 'Gemini'
                  : selectedModel
                  ? selectedModel.split(':')[0]
                  : 'Ollama'
                : 'Offline'}
            </span>
          </div>
        </div>

        {/* Header circular outline buttons */}
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="size-8 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shadow-2xs cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}

          {customPos !== null && (
            <button
              type="button"
              onClick={() => {
                setCustomPos(null)
                setIsMaximized(false)
              }}
              className="size-8 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
              title="Re-dock to shape"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleMaximize}
            className="size-8 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
            title={isMaximized ? "Restore size" : "Maximize / Expand"}
          >
            {isMaximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs cursor-pointer"
            title="Close (Esc)"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[140px]">
        {messages.length === 0 && !streamingContent && (
          <div className="h-full flex flex-col items-center justify-center py-8 px-4 text-center select-none">
            <div className="size-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300 mb-3.5 shadow-2xs">
              <Sparkles className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {currentShapeText ? `Focusing on ${currentShapeText.slice(0, 22)}...` : 'Morning, shadcn!'}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-[270px] leading-relaxed">
              What are we working on today? Press send to start a new conversation
            </p>

            {/* Quick Suggestion Chips in Empty State */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-5 max-w-[340px]">
              {connectedRepo && (
                <button
                  type="button"
                  onClick={() => handleSend(`Check for open issues in ${connectedRepo}`)}
                  className="px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <GitBranch className="size-3 text-blue-600 dark:text-blue-400" />
                  <span>GitHub Issues</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  handleSend(
                    'Triage and prioritize the issues based on current canvas priorities, and propose prioritized task cards for them.'
                  )
                }
                className="px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Target className="size-3 text-blue-600 dark:text-blue-400" />
                <span>Triage & Prioritize</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend('Break down this item into 3 actionable task cards')}
                className="px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ListTodo className="size-3 text-blue-500" />
                <span>Break into Tasks</span>
              </button>
              <button
                type="button"
                onClick={() => handleSend('Deconstruct this idea into 3 concrete, sequential steps')}
                className="px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Zap className="size-3 text-amber-500" />
                <span>Deconstruct</span>
              </button>
              <button
                type="button"
                onClick={handleJevAudit}
                className="px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Target className="size-3 text-blue-600 dark:text-blue-400" />
                <span>Audit Element</span>
              </button>
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isJevEval =
            m.role === 'assistant' &&
            (m.content.includes('Priority & Actionability Evaluation') ||
              m.content.includes('TypeSafe Jev System One Evaluation'))

          if (isJevEval) {
            return (
              <div key={m.id} className="w-full">
                <JevEvaluationCard
                  content={m.content}
                  onDeconstruct={() =>
                    handleSend('Deconstruct this idea into 3 concrete, sequential steps')
                  }
                  onFocus={() => {
                    if (shapeId) {
                      window.dispatchEvent(
                        new CustomEvent('foqz:set-focus-target', {
                          detail: { shapeId },
                        }),
                      )
                      onClose()
                    }
                  }}
                />
              </div>
            )
          }

          return (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`px-4 py-2.5 rounded-2xl max-w-[92%] ${
                  m.role === 'user'
                    ? 'rounded-tr-sm bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 whitespace-pre-wrap'
                    : 'rounded-tl-sm bg-zinc-100/90 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/60 dark:border-zinc-800/70'
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
                      if (seg.type === 'streaming-canvas') {
                        return (
                          <div
                            key={sIdx}
                            className="p-2 rounded-xl border border-dashed border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 animate-pulse font-sans"
                          >
                            <Sparkles className="size-3.5 text-blue-500" />
                            <span>Structuring canvas cards & tasks...</span>
                          </div>
                        )
                      }
                      return null
                    })}
                  </div>
                )}

                {/* Executed Tools Accordion */}
                {m.executedTools && m.executedTools.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 font-sans">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-500 font-semibold mb-1">
                      <span className="flex items-center gap-1">
                        <Wrench className="size-3 text-blue-600 dark:text-blue-400" />
                        <span>Executed Tools ({m.executedTools.length})</span>
                      </span>
                      <span>
                        {m.executedTools.reduce((acc, t) => acc + (t.durationMs || 0), 0)}ms
                      </span>
                    </div>
                    <div className="space-y-1">
                      {m.executedTools.map((t) => {
                        const isExpanded = expandedToolIds.has(t.id);
                        let resultText = "";
                        if (t.result?.content) {
                          resultText = t.result.content
                            .map((c: any) =>
                              typeof c === "string" ? c : c.text || JSON.stringify(c, null, 2),
                            )
                            .join("\n");
                        } else if (t.result) {
                          resultText = JSON.stringify(t.result, null, 2);
                        }

                        return (
                          <div
                            key={t.id}
                            className="rounded-lg border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900/60 overflow-hidden text-[11px]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedToolIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(t.id)) next.delete(t.id);
                                  else next.add(t.id);
                                  return next;
                                });
                              }}
                              className="w-full px-2.5 py-1.5 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-left cursor-pointer"
                            >
                              <span className="font-mono text-blue-600 dark:text-blue-400 font-medium truncate max-w-[280px]">
                                {t.serverName ? `${t.serverName}:${t.toolName}` : t.toolName}
                              </span>
                              {isExpanded ? (
                                <ChevronDown className="size-3 text-zinc-400" />
                              ) : (
                                <ChevronRight className="size-3 text-zinc-400" />
                              )}
                            </button>
                            {isExpanded && (
                              <div className="p-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-950 text-zinc-300 font-mono text-[10px] max-h-48 overflow-y-auto whitespace-pre-wrap">
                                {resultText || "No output returned"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Active Tool Calling Indicator */}
        {activeTool && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 text-xs font-mono animate-pulse">
            <Wrench className="size-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Calling tool: {activeTool}...</span>
          </div>
        )}

        {streamingContent && (
          <div className="flex flex-col items-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm max-w-[92%] bg-zinc-100/90 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/60 dark:border-zinc-800/70 shadow-2xs">
              <div className="space-y-2">
                {parseOutputSegments(streamingContent).map((seg, sIdx) => {
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
                  if (seg.type === 'streaming-canvas') {
                    return (
                      <div
                        key={sIdx}
                        className="p-2 rounded-xl border border-dashed border-blue-300 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2 animate-pulse font-sans"
                      >
                        <Sparkles className="size-3.5 text-blue-500" />
                        <span>Structuring canvas cards & tasks...</span>
                      </div>
                    )
                  }
                  return null
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Card Capsule (matching shadcn AI Chat style) */}
      <div className="p-4 pt-1 bg-white dark:bg-zinc-950 shrink-0">
        <div className="relative rounded-[22px] bg-zinc-100/90 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/80 p-3 focus-within:border-zinc-300 dark:focus-within:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all shadow-2xs">
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
            placeholder="Ask or refine this idea..."
            disabled={isStreaming}
            rows={2}
            className="w-full bg-transparent border-0 p-0 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none resize-none focus:ring-0 leading-relaxed min-h-[40px] max-h-[140px]"
          />

          <div className="flex items-center justify-between pt-1 mt-1 border-t border-zinc-200/30 dark:border-zinc-800/30">
            {/* Left + circular button for quick actions & prompts */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowActionMenu((prev) => !prev)}
                className={`size-7 rounded-full border flex items-center justify-center transition-all shadow-2xs cursor-pointer ${
                  showActionMenu
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200/80 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50'
                }`}
                title="Quick actions & prompts"
              >
                <Plus className={`size-3.5 transition-transform ${showActionMenu ? 'rotate-45' : ''}`} />
              </button>

              {/* Action Popover Menu */}
              {showActionMenu && (
                <div className="absolute bottom-9 left-0 z-50 w-60 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                  {connectedRepo && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionMenu(false)
                        handleSend(`Check for open issues in ${connectedRepo}`)
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <GitBranch className="size-3 text-blue-600 dark:text-blue-400" />
                      <span>GitHub Issues</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleSend(
                        'Triage and prioritize the issues based on current canvas priorities, and propose prioritized task cards for them.'
                      )
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Target className="size-3 text-blue-600 dark:text-blue-400" />
                    <span>Triage & Prioritize</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleSend('Break down this item into 3 actionable task cards')
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <ListTodo className="size-3 text-blue-500" />
                    <span>Break into Tasks</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleSend('Deconstruct this idea into 3 concrete, sequential steps')
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Zap className="size-3 text-amber-500" />
                    <span>Deconstruct</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleJevAudit()
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Target className="size-3 text-blue-600 dark:text-blue-400" />
                    <span>Audit Element</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActionMenu(false)
                      handleSend('What are the potential technical edge cases or blindspots for this?')
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <Search className="size-3 text-zinc-500" />
                    <span>Scan Blindspots</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right: optional Spawn button + Circular Blue Send Button */}
            <div className="flex items-center gap-2">
              {messages.some((m) => m.role === 'assistant') && (
                <button
                  type="button"
                  onClick={handleSpawnChildren}
                  title="Spawn child cards with connecting arrows directly on canvas"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium transition-colors cursor-pointer shadow-2xs"
                >
                  {spawnedCount !== null ? (
                    <>
                      <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Spawned ({spawnedCount})</span>
                    </>
                  ) : (
                    <>
                      <Plus className="size-2.5" />
                      <span>Spawn to Canvas</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!prompt.trim() || isStreaming}
                className="size-7 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-xs cursor-pointer shrink-0"
                title="Send message (Enter)"
              >
                <ArrowUp className="size-3.5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edge & Corner Resize Handles */}
      {/* Right Edge */}
      <div
        className="absolute top-0 right-0 w-2 h-full cursor-ew-resize hover:bg-blue-500/20 transition-colors z-20"
        onPointerDown={(e) => handleResizeStart('e', e)}
        title="Resize horizontally"
      />
      {/* Bottom Edge */}
      <div
        className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize hover:bg-blue-500/20 transition-colors z-20"
        onPointerDown={(e) => handleResizeStart('s', e)}
        title="Resize vertically"
      />
      {/* Left Edge */}
      <div
        className="absolute top-0 left-0 w-2 h-full cursor-ew-resize hover:bg-blue-500/20 transition-colors z-20"
        onPointerDown={(e) => handleResizeStart('w', e)}
        title="Resize horizontally"
      />
      {/* Bottom-Left Corner */}
      <div
        className="absolute bottom-0 left-0 size-3.5 cursor-nesw-resize z-30"
        onPointerDown={(e) => handleResizeStart('sw', e)}
        title="Resize corner"
      />
      {/* Bottom-Right Corner (with visual grip indicator) */}
      <div
        className="absolute bottom-0 right-0 size-4 cursor-nwse-resize flex items-end justify-end p-0.5 z-30 group"
        onPointerDown={(e) => handleResizeStart('se', e)}
        title="Drag to resize (NW-SE)"
      >
        <svg
          className="size-2.5 text-zinc-400 group-hover:text-blue-500 transition-colors pointer-events-none"
          viewBox="0 0 10 10"
          fill="currentColor"
        >
          <circle cx="8" cy="8" r="1.2" />
          <circle cx="8" cy="4" r="1.2" />
          <circle cx="4" cy="8" r="1.2" />
        </svg>
      </div>
    </div>
  )
}
