import React, { useMemo } from 'react'
import {
  CheckCircle2,
  Clock,
  Play,
  Pause,
  Lock,
  X,
  Plus,
  FolderGit2,
  Layers,
  Sparkles,
  Zap,
  PlaneTakeoff,
  Undo2,
  Target,
  Check,
  MessageSquare,
} from 'lucide-react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import { extractChecklistStats } from '@/lib/markdown'

interface ActiveNodeControlStripProps {
  nodeId: string | null
  isCanvasScope: boolean
}

const PRIORITY_META: Record<
  number,
  { label: string; text: string; bg: string; dot: string; border: string }
> = {
  1: {
    label: 'P1 Urgent',
    text: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    dot: 'bg-rose-500',
    border: 'border-rose-200 dark:border-rose-800/60',
  },
  2: {
    label: 'P2 High',
    text: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    dot: 'bg-amber-500',
    border: 'border-amber-200 dark:border-amber-800/60',
  },
  3: {
    label: 'P3 Normal',
    text: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    dot: 'bg-blue-500',
    border: 'border-blue-200 dark:border-blue-800/60',
  },
  4: {
    label: 'P4 Low',
    text: 'text-zinc-600 dark:text-zinc-400',
    bg: 'bg-zinc-100 dark:bg-zinc-800/50',
    dot: 'bg-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-700',
  },
}

const PAPER_COLORS: Record<string, { label: string; dot: string; title: string }> = {
  cream: { label: 'Cream', dot: 'bg-[#faf6ee] border-[#e8dfc8]', title: 'Cream Paper' },
  fog: { label: 'Fog', dot: 'bg-[#f1f3f5] border-[#d8dce0]', title: 'Fog Paper' },
  bloom: { label: 'Bloom', dot: 'bg-[#fdf2f4] border-[#f4cfd7]', title: 'Bloom Paper' },
  sage: { label: 'Sage', dot: 'bg-[#eef6f2] border-[#c8e2d4]', title: 'Sage Paper' },
}

const PROJECT_ACCENTS = [
  { id: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'purple', label: 'Purple', dot: 'bg-purple-500' },
]

export function ActiveNodeControlStrip({
  nodeId,
  isCanvasScope,
}: ActiveNodeControlStripProps) {
  const allNodes = useFlowCanvasStore((s) => s.nodes)
  const node = useMemo(() => {
    if (isCanvasScope || !nodeId) return null
    return allNodes.find((n) => n.id === nodeId) || null
  }, [allNodes, nodeId, isCanvasScope])

  const activeFocusNodeId = useFlowCanvasStore((s) => s.activeFocusNodeId)
  const isTimerRunning = useFlowCanvasStore((s) => s.isTimerRunning)
  const timerSecondsRemaining = useFlowCanvasStore((s) => s.timerSecondsRemaining)
  const updateNodeData = useFlowCanvasStore((s) => s.updateNodeData)
  const setActiveFocusNodeId = useFlowCanvasStore((s) => s.setActiveFocusNodeId)
  const setIsTimerRunning = useFlowCanvasStore((s) => s.setIsTimerRunning)
  const setTimerSecondsRemaining = useFlowCanvasStore((s) => s.setTimerSecondsRemaining)
  const stageRunway = useFlowCanvasStore((s) => s.stageRunway)
  const returnTaskToProject = useFlowCanvasStore((s) => s.returnTaskToProject)
  const sendTaskToRunway = useFlowCanvasStore((s) => s.sendTaskToRunway)
  const createTask = useFlowCanvasStore((s) => s.createTask)
  const createProject = useFlowCanvasStore((s) => s.createProject)
  const annotations = useFlowCanvasStore((s) => s.annotations)

  const isTask = node?.type === 'focusTask'
  const isRunway =
    node?.type === 'runwayFrame' ||
    (node?.type === 'projectFrame' && String((node?.data as any)?.title || '').includes('Runway'))
  const isProject = node?.type === 'projectFrame' && !isRunway

  // Format seconds to mm:ss
  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timerSecondsRemaining / 60)
    const secs = timerSecondsRemaining % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }, [timerSecondsRemaining])

  // Macro board metrics
  const macroStats = useMemo(() => {
    if (!isCanvasScope) return null
    const runways = allNodes.filter(
      (n) => n.type === 'runwayFrame' || String((n.data as any)?.title || '').includes('Runway')
    )
    const projects = allNodes.filter(
      (n) => n.type === 'projectFrame' && !String((n.data as any)?.title || '').includes('Runway')
    )
    const tasks = allNodes.filter((n) => n.type === 'focusTask')
    const doneTasks = tasks.filter((t) => (t.data as any)?.status === 'done')
    return {
      runwaysCount: runways.length,
      projectsCount: projects.length,
      tasksCount: tasks.length,
      doneCount: doneTasks.length,
    }
  }, [allNodes, isCanvasScope])

  // Project frame metrics (aggregates both direct children and tasks staged on runways)
  const projectStats = useMemo(() => {
    if (!isProject || !node) return null
    const allProjectTasks = allNodes.filter(
      (n) =>
        n.type === 'focusTask' &&
        (n.parentId === node.id || (n.data as any)?.originProjectId === node.id)
    )
    const doneTasks = allProjectTasks.filter((t) => (t.data as any)?.status === 'done')
    const percent =
      allProjectTasks.length > 0
        ? Math.round((doneTasks.length / allProjectTasks.length) * 100)
        : 0
    const stagedCount = allProjectTasks.filter(
      (t) => (t.data as any)?.originProjectId === node.id && t.parentId !== node.id
    ).length

    return {
      total: allProjectTasks.length,
      done: doneTasks.length,
      percent,
      stagedCount,
    }
  }, [allNodes, isProject, node])

  // Runway frame metrics
  const runwayStats = useMemo(() => {
    if (!isRunway || !node) return null
    const stagedTasks = allNodes.filter(
      (n) => n.type === 'focusTask' && n.parentId === node.id
    )
    const doneTasks = stagedTasks.filter((t) => (t.data as any)?.status === 'done')
    const blockedTasks = stagedTasks.filter((t) => {
      const deps = (t.data as any)?.dependencies || []
      return deps.some((depId: string) => {
        const dep = allNodes.find((d) => d.id === depId)
        return dep && (dep.data as any)?.status !== 'done'
      })
    })
    const maxCapacity = (node.data as any)?.maxCapacity || 5
    const clearancePercent =
      stagedTasks.length > 0
        ? Math.round((doneTasks.length / stagedTasks.length) * 100)
        : 0

    return {
      total: stagedTasks.length,
      done: doneTasks.length,
      blocked: blockedTasks.length,
      maxCapacity,
      clearancePercent,
      templateId: (node.data as any)?.templateId || 'custom',
    }
  }, [allNodes, isRunway, node])

  // Handlers for task mutations
  const handleCycleStatus = () => {
    if (!node) return
    const curStatus = (node.data as any)?.status || 'open'
    const nextStatus = curStatus === 'open' ? 'doing' : curStatus === 'doing' ? 'done' : 'open'
    updateNodeData(node.id, { status: nextStatus })
  }

  const handleCyclePriority = () => {
    if (!node) return
    const curPrio = (node.data as any)?.priority ?? 3
    const nextPrio = curPrio === 1 ? 2 : curPrio === 2 ? 3 : curPrio === 3 ? 4 : 1
    updateNodeData(node.id, { priority: nextPrio })
  }

  const handleSetPaper = (paperKey: string) => {
    if (!node) return
    updateNodeData(node.id, { paper: paperKey })
  }

  const handleStartFocus = () => {
    if (!node) return
    setActiveFocusNodeId(node.id)
    setIsTimerRunning(true)
    setTimerSecondsRemaining(25 * 60)
    updateNodeData(node.id, { status: 'doing' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('foqz:set-focus-target', { detail: { shapeId: node.id } })
      )
    }
  }

  const handleStopFocus = () => {
    setActiveFocusNodeId(null)
    setIsTimerRunning(false)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('foqz:set-focus-target', { detail: { shapeId: null } })
      )
    }
  }

  const handleOpenLockedFocus = () => {
    if (!node) return
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('foqz:set-focus-target', { detail: { shapeId: node.id } })
      )
    }
  }

  // Task Control Strip
  if (isTask && node) {
    const taskData = (node.data || {}) as Record<string, any>
    const status = taskData.status || 'open'
    const priority = taskData.priority ?? 3
    const paper = taskData.paper || 'cream'
    const prioMeta = PRIORITY_META[priority] || PRIORITY_META[3]
    const isFocused = activeFocusNodeId === node.id

    const checklistStats = extractChecklistStats(taskData.notes || '')

    const parentNode = node.parentId ? allNodes.find((n) => n.id === node.parentId) : null
    const isTaskInsideRunway = Boolean(
      parentNode &&
      (parentNode.type === 'runwayFrame' ||
        String((parentNode.data as any)?.title || '').includes('Runway'))
    )

    return (
      <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none gap-2">
        {/* Left: Status & Priority interactive pills & Task Title */}
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {/* Status Cycle Button */}
          <button
            type="button"
            onClick={handleCycleStatus}
            title="Click to cycle status: Open -> Doing -> Done"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer shrink-0 ${
              status === 'done'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : status === 'doing'
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
            }`}
          >
            {status === 'done' ? (
              <CheckCircle2 className="size-2.5" />
            ) : (
              <span
                className={`size-1.5 rounded-full ${
                  status === 'doing' ? 'bg-amber-500 animate-pulse' : 'bg-zinc-400'
                }`}
              />
            )}
            <span className="capitalize">{status}</span>
          </button>

          {/* Priority Pill */}
          <button
            type="button"
            onClick={handleCyclePriority}
            title="Click to cycle priority: P1 Urgent -> P2 High -> P3 Normal -> P4 Low"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer shrink-0 ${prioMeta.bg} ${prioMeta.text} ${prioMeta.border}`}
          >
            <span className={`size-1.5 rounded-full ${prioMeta.dot}`} />
            <span>{prioMeta.label}</span>
          </button>

          {/* Task Title (Interactive: click to focus/center on canvas) */}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent('foqz:flow-center-on', { detail: { id: node.id } })
              )
            }
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer truncate max-w-[180px] sm:max-w-[240px] text-zinc-900 dark:text-zinc-100 font-semibold text-[11px]"
            title="Click to center canvas on this task"
          >
            <Target className="size-3 text-rose-500 shrink-0" />
            <span className="truncate">{taskData.title || 'Untitled Task'}</span>
          </button>
        </div>

        {/* Center: What it's about / Checklist preview & Origin Context */}
        <div className="hidden lg:flex items-center gap-2 min-w-0 flex-1 justify-center px-2">
          {/* Origin/Container Breadcrumb */}
          {isTaskInsideRunway ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 shrink-0">
              <PlaneTakeoff className="size-2.5" />
              <span>{parentNode?.data?.title || 'Runway'}</span>
            </span>
          ) : parentNode ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 shrink-0">
              <FolderGit2 className="size-2.5" />
              <span>{(parentNode.data as any)?.title || 'Project'}</span>
            </span>
          ) : null}

          {/* What this task is about preview */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 text-[11px] truncate max-w-[360px]">
            <Sparkles className="size-2.5 text-zinc-400 shrink-0" />
            {checklistStats.nextPendingItem ? (
              <span className="truncate">
                <span className="text-[10px] font-mono text-zinc-400 uppercase font-semibold mr-1">
                  Next:
                </span>
                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                  {checklistStats.nextPendingItem}
                </span>
              </span>
            ) : checklistStats.firstLine ? (
              <span className="truncate text-zinc-600 dark:text-zinc-300">
                {checklistStats.firstLine}
              </span>
            ) : (
              <span className="italic text-zinc-400 text-[10px]">
                No action steps defined
              </span>
            )}
            {checklistStats.total > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 shrink-0">
                {checklistStats.done}/{checklistStats.total}
              </span>
            )}
          </div>
        </div>

        {/* Right: Runway Stage / Return action & Focus sprint controller */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Annotate Button with Count Badge */}
          {(() => {
            const nodeAnnotations = Object.values(annotations || {}).filter(
              (a) => a.anchor.nodeId === node.id && a.status === 'open'
            )
            return (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('foqz:open-annotation-composer', {
                      detail: { nodeId: node.id },
                    })
                  )
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-black/10 dark:border-white/10 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer"
                title="Annotate this task card"
              >
                <MessageSquare className="size-2.5" />
                <span>Annotate</span>
                {nodeAnnotations.length > 0 && (
                  <span className="px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white leading-none">
                    {nodeAnnotations.length}
                  </span>
                )}
              </button>
            )
          })()}

          {isTaskInsideRunway ? (
            node.data?.originProjectId && (
              <button
                type="button"
                onClick={() => returnTaskToProject(node.id)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                title={`Return task to ${node.data?.originProjectTitle || 'origin project'}`}
              >
                <Undo2 className="size-2.5" />
                <span>Return to Project</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => sendTaskToRunway(node.id)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors cursor-pointer shadow-2xs"
              title="Send to Runway for focused execution (R)"
            >
              <PlaneTakeoff className="size-2.5" />
              <span>Send to Runway</span>
            </button>
          )}

          {isFocused ? (
            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold">
              <span className={`size-1.5 rounded-full bg-rose-500 ${isTimerRunning ? 'animate-ping' : ''}`} />
              <span>{formattedTimer}</span>
              <button
                type="button"
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                title={isTimerRunning ? 'Pause timer' : 'Resume timer'}
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer p-0.5"
              >
                {isTimerRunning ? <Pause className="size-2.5" /> : <Play className="size-2.5" />}
              </button>
              <button
                type="button"
                onClick={() => updateNodeData(node.id, { status: 'done' })}
                title="Mark completed (Auto-advances if in Runway)"
                className="ml-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-sans text-[9px] font-medium cursor-pointer"
              >
                <Check className="size-2.5 stroke-[3]" />
                <span>Done</span>
              </button>
              <button
                type="button"
                onClick={handleOpenLockedFocus}
                title="Open Fullscreen Locked Focus"
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer p-0.5 ml-0.5"
              >
                <Lock className="size-2.5" />
              </button>
              <button
                type="button"
                onClick={handleStopFocus}
                title="Exit Focus Session"
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer p-0.5"
              >
                <X className="size-2.5 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartFocus}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs cursor-pointer"
            >
              <Play className="size-2.5 fill-current" />
              <span>Focus 25m</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // Runway Frame Control Strip
  if (isRunway && node) {
    const runwayData = (node.data || {}) as Record<string, any>
    const title = runwayData.title || "Today's Runway"

    const runwayTasks = allNodes.filter(
      (n) => n.parentId === node.id && n.type === 'focusTask'
    )
    const activeFlight =
      runwayTasks.find((t) => t.id === activeFocusNodeId) ||
      runwayTasks.find((t) => (t.data as any)?.status === 'doing') ||
      runwayTasks.find((t) => (t.data as any)?.status !== 'done') ||
      runwayTasks[0]

    const activeFlightChecklist = activeFlight
      ? extractChecklistStats((activeFlight.data as any)?.notes || '')
      : null

    const isFlightFocused = Boolean(activeFlight && activeFocusNodeId === activeFlight.id)

    return (
      <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none gap-2">
        {/* Left: Runway clearance metrics */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <PlaneTakeoff className="size-3.5 text-amber-500 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
              {title}
            </span>
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              • {runwayStats?.done || 0}/{runwayStats?.total || 0} Cleared
            </span>
            <div className="w-14 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${runwayStats?.clearancePercent || 0}%` }}
              />
            </div>
            {runwayStats && runwayStats.blocked > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                ⛔ {runwayStats.blocked} Blocked
              </span>
            )}
          </div>
        </div>

        {/* Center: Current Active Flight & What it's about */}
        {activeFlight && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] truncate max-w-[360px]">
            <span className={`size-1.5 rounded-full bg-rose-500 ${isFlightFocused ? 'animate-ping' : ''} shrink-0`} />
            <span className="font-semibold text-[10px] font-mono shrink-0 uppercase">Flight:</span>
            <span className="font-medium truncate text-zinc-900 dark:text-zinc-100">
              {(activeFlight.data as any)?.title || 'Untitled'}
            </span>
            {activeFlightChecklist?.nextPendingItem && (
              <span className="text-zinc-500 dark:text-zinc-400 truncate text-[10px] ml-1">
                ({activeFlightChecklist.nextPendingItem})
              </span>
            )}
          </div>
        )}

        {/* Right: Quick action inside Runway & Focus Active Flight */}
        <div className="flex items-center gap-1.5 shrink-0">
          {activeFlight && (
            <button
              type="button"
              onClick={() => {
                setActiveFocusNodeId(activeFlight.id)
                setIsTimerRunning(true)
                updateNodeData(activeFlight.id, { status: 'doing' })
                window.dispatchEvent(
                  new CustomEvent('foqz:set-focus-target', {
                    detail: { shapeId: activeFlight.id },
                  })
                )
                window.dispatchEvent(
                  new CustomEvent('foqz:flow-center-on', {
                    detail: { id: activeFlight.id },
                  })
                )
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors shadow-2xs font-semibold cursor-pointer ${
                isFlightFocused
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/60'
              }`}
              title="Focus currently staged flight on this runway"
            >
              <Target className="size-2.5" />
              <span>{isFlightFocused ? 'In Flight' : 'Focus Flight'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              createTask({
                title: 'New Flight Task',
                parentId: node.id,
                priority: 2,
              })
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500 text-zinc-950 hover:bg-amber-400 transition-colors shadow-2xs font-semibold cursor-pointer"
          >
            <Plus className="size-2.5 stroke-[2.5]" />
            <span>Add to Runway</span>
          </button>
        </div>
      </div>
    )
  }

  // Project Frame Control Strip
  if (isProject && node) {
    const projectData = (node.data || {}) as Record<string, any>
    const accent = projectData.accent || 'blue'

    return (
      <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none">
        {/* Left: Progress indicator */}
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-3.5 text-blue-500 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              {projectStats?.done || 0}/{projectStats?.total || 0} Tasks
            </span>
            <div className="w-14 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${projectStats?.percent || 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-zinc-400">
              {projectStats?.percent || 0}%
            </span>
          </div>

          {/* Accent Color Selector */}
          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-black/[0.08] dark:border-white/[0.08]">
            {PROJECT_ACCENTS.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => updateNodeData(node.id, { accent: acc.id })}
                title={`Accent: ${acc.label}`}
                className={`size-2.5 rounded-full transition-transform cursor-pointer ${
                  acc.dot
                } ${accent === acc.id ? 'ring-1.5 ring-blue-500 scale-125' : 'opacity-60 hover:opacity-100 hover:scale-110'}`}
              />
            ))}
          </div>
        </div>

        {/* Right: Annotate & Fast +Task in Frame button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {(() => {
            const projectAnnotations = Object.values(annotations || {}).filter(
              (a) => a.anchor.nodeId === node.id && a.status === 'open'
            )
            return (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('foqz:open-annotation-composer', {
                      detail: { nodeId: node.id },
                    })
                  )
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-black/10 dark:border-white/10 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer"
                title="Annotate this project milestone"
              >
                <MessageSquare className="size-2.5" />
                <span>Annotate</span>
                {projectAnnotations.length > 0 && (
                  <span className="px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white leading-none">
                    {projectAnnotations.length}
                  </span>
                )}
              </button>
            )
          })()}

          <button
            type="button"
            onClick={() => {
              createTask({
                title: 'New Milestone Task',
                parentId: node.id,
                priority: 3,
              })
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-2.5" />
            <span>Add Task</span>
          </button>
        </div>
      </div>
    )
  }

  // Macro Board Scope Control Strip
  if (isCanvasScope) {
    return (
      <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none">
        {/* Left: Macro overview numbers */}
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 text-rose-500 shrink-0" />
          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
            {macroStats?.runwaysCount ? `${macroStats.runwaysCount} Runways • ` : ''}
            {macroStats?.projectsCount || 0} Projects • {macroStats?.tasksCount || 0} Tasks (
            {macroStats?.doneCount || 0} Done)
          </span>
        </div>

        {/* Right: Quick canvas staging buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stageRunway()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors cursor-pointer"
          >
            <Zap className="size-2.5 text-rose-500" />
            <span>Today's Runway</span>
          </button>
          <button
            type="button"
            onClick={() => createTask({ title: 'New Task', priority: 3 })}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            <Plus className="size-2.5" />
            <span>Task</span>
          </button>
        </div>
      </div>
    )
  }

  return null
}
