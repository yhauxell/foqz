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
} from 'lucide-react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'

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
  const createTask = useFlowCanvasStore((s) => s.createTask)
  const createProject = useFlowCanvasStore((s) => s.createProject)

  const isTask = node?.type === 'focusTask'
  const isProject = node?.type === 'projectFrame'

  // Format seconds to mm:ss
  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timerSecondsRemaining / 60)
    const secs = timerSecondsRemaining % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }, [timerSecondsRemaining])

  // Macro board metrics
  const macroStats = useMemo(() => {
    if (!isCanvasScope) return null
    const projects = allNodes.filter((n) => n.type === 'projectFrame')
    const tasks = allNodes.filter((n) => n.type === 'focusTask')
    const doneTasks = tasks.filter((t) => (t.data as any)?.status === 'done')
    return {
      projectsCount: projects.length,
      tasksCount: tasks.length,
      doneCount: doneTasks.length,
    }
  }, [allNodes, isCanvasScope])

  // Project frame metrics
  const projectStats = useMemo(() => {
    if (!isProject || !node) return null
    const childTasks = allNodes.filter(
      (n) => n.parentId === node.id && n.type === 'focusTask'
    )
    const doneTasks = childTasks.filter((t) => (t.data as any)?.status === 'done')
    const percent =
      childTasks.length > 0 ? Math.round((doneTasks.length / childTasks.length) * 100) : 0
    return {
      total: childTasks.length,
      done: doneTasks.length,
      percent,
    }
  }, [allNodes, isProject, node])

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

    return (
      <div className="px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none">
        {/* Left: Status & Priority interactive pills */}
        <div className="flex items-center gap-1.5">
          {/* Status Cycle Button */}
          <button
            type="button"
            onClick={handleCycleStatus}
            title="Click to cycle status: Open -> Doing -> Done"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
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
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${prioMeta.bg} ${prioMeta.text} ${prioMeta.border}`}
          >
            <span className={`size-1.5 rounded-full ${prioMeta.dot}`} />
            <span>{prioMeta.label}</span>
          </button>

          {/* Paper Theme Picker */}
          <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-black/[0.08] dark:border-white/[0.08]">
            {Object.entries(PAPER_COLORS).map(([pKey, pVal]) => (
              <button
                key={pKey}
                type="button"
                onClick={() => handleSetPaper(pKey)}
                title={pVal.title}
                className={`size-3.5 rounded-full border shadow-2xs transition-transform cursor-pointer ${
                  pVal.dot
                } ${paper === pKey ? 'ring-1.5 ring-blue-500 scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>

        {/* Right: Focus sprint controller */}
        <div className="flex items-center gap-1.5">
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
                onClick={handleOpenLockedFocus}
                title="Open Fullscreen Locked Focus"
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer p-0.5"
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

        {/* Right: Fast +Task in Frame button */}
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
