import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { type Editor, type TLShapeId, useValue } from 'tldraw'
import {
  Lock,
  Unlock,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Clock,
  Plus,
  Check,
  Edit3,
  MessageSquare,
  ChevronRight,
  FolderGit2,
} from 'lucide-react'
import { extractTextFromShape } from '@/lib/canvasContext'
import { evaluateUnlockFriction } from '@/lib/jev'
import { findContainingProjectFrame } from '@/lib/canvasSpawner'
import type { TLFocusTaskShape } from '@/shapes/focusTask/FocusTaskShapeUtil'
import { renderMarkdownBlock, toggleCheckboxInMarkdown } from '@/lib/markdown'

interface MonoFocusControllerProps {
  editor: Editor | null
  activeShapeId: TLShapeId | null
  onClearFocus: () => void
}

const PRIORITY_CONFIG: Record<
  number,
  { label: string; bg: string; text: string; dot: string; border: string }
> = {
  1: {
    label: 'P1 Urgent',
    bg: 'bg-rose-500/15',
    text: 'text-rose-400',
    dot: 'bg-rose-500',
    border: 'border-rose-500/30',
  },
  2: {
    label: 'P2 High',
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
    border: 'border-amber-500/30',
  },
  3: {
    label: 'P3 Normal',
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    dot: 'bg-blue-500',
    border: 'border-blue-500/30',
  },
  4: {
    label: 'P4 Low',
    bg: 'bg-zinc-500/15',
    text: 'text-zinc-400',
    dot: 'bg-zinc-500',
    border: 'border-zinc-500/30',
  },
}

export function MonoFocusController({
  editor,
  activeShapeId,
  onClearFocus,
}: MonoFocusControllerProps) {
  const [isLocked, setIsLocked] = useState(true)
  const [totalSeconds, setTotalSeconds] = useState(25 * 60)
  const [secondsRemaining, setSecondsRemaining] = useState(25 * 60)
  const [isRunning, setIsRunning] = useState(true)
  const [showExitModal, setShowExitModal] = useState(false)
  const [exitReason, setExitReason] = useState('')
  const [isEvaluatingExit, setIsEvaluatingExit] = useState(false)
  const [exitFeedback, setExitFeedback] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeShape = useValue(
    'active focus shape',
    () => {
      if (!editor || !activeShapeId) return null
      return editor.getShape(activeShapeId)
    },
    [editor, activeShapeId],
  )

  const shapeTitle = useMemo(() => {
    if (!activeShape) return 'Untitled Focus'
    return extractTextFromShape(activeShape) || 'Untitled Focus'
  }, [activeShape])

  const isFocusTask = activeShape?.type === 'focus-task'
  const taskShape = isFocusTask ? (activeShape as TLFocusTaskShape) : null

  // Resolve parent project frame if contained
  const containingProject = useMemo(() => {
    if (!editor || !activeShape) return null
    return findContainingProjectFrame(editor, activeShape)
  }, [editor, activeShape])

  // Camera lock: auto-zoom to the active shape when focus is initiated
  useEffect(() => {
    if (!editor || !activeShapeId || !isLocked) return

    const bounds = editor.getShapePageBounds(activeShapeId)
    if (bounds) {
      editor.zoomToBounds(bounds, {
        targetZoom: 1.15,
        animation: { duration: 400 },
      })
    }
  }, [editor, activeShapeId, isLocked])

  // Initialize drafts from shape
  useEffect(() => {
    if (taskShape) {
      setTitleDraft(taskShape.props.title || '')
      setNotesDraft(taskShape.props.notes || '')
    } else if (activeShape) {
      setTitleDraft(shapeTitle)
    }
  }, [taskShape, activeShape, shapeTitle])

  // Timer interval
  useEffect(() => {
    if (!isRunning || secondsRemaining <= 0) return

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isRunning, secondsRemaining])

  // Keydown listener for Esc: hold to escape
  useEffect(() => {
    if (!activeShapeId || !isLocked) return

    let startTime = 0

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!showExitModal) {
          setShowExitModal(true)
          return
        }

        if (startTime === 0) {
          startTime = Date.now()
          holdTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(100, (elapsed / 3000) * 100)
            setHoldProgress(progress)

            if (progress >= 100) {
              if (holdTimerRef.current) clearInterval(holdTimerRef.current)
              handleForceUnlock()
            }
          }, 50)
        }
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        startTime = 0
        if (holdTimerRef.current) {
          clearInterval(holdTimerRef.current)
          holdTimerRef.current = null
        }
        setHoldProgress(0)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (holdTimerRef.current) clearInterval(holdTimerRef.current)
    }
  }, [activeShapeId, isLocked, showExitModal])

  const handleForceUnlock = () => {
    setShowExitModal(false)
    setIsLocked(false)
    onClearFocus()
  }

  const handleEvaluateReason = async () => {
    if (!exitReason.trim()) return
    setIsEvaluatingExit(true)
    setExitFeedback(null)

    try {
      const evalRes = await evaluateUnlockFriction(exitReason, shapeTitle)
      if (evalRes.isLegitimate) {
        setShowExitModal(false)
        setIsLocked(false)
        onClearFocus()
      } else {
        setExitFeedback(
          'Impulsive context switch detected. Take 3 deep breaths or hold Esc for 3s to override.',
        )
      }
    } catch {
      // Fallback if no API key: allow unlock
      setShowExitModal(false)
      setIsLocked(false)
      onClearFocus()
    } finally {
      setIsEvaluatingExit(false)
    }
  }

  const updateTaskProps = useCallback(
    (patch: Partial<TLFocusTaskShape['props']>) => {
      if (!editor || !activeShapeId || !taskShape) return
      editor.updateShape({
        id: activeShapeId,
        type: 'focus-task',
        props: { ...taskShape.props, ...patch },
      })
    },
    [editor, activeShapeId, taskShape],
  )

  const handleToggleDone = () => {
    if (!taskShape) return
    const nextStatus = taskShape.props.status === 'done' ? 'open' : 'done'
    updateTaskProps({ status: nextStatus })
    if (nextStatus === 'done') {
      setIsRunning(false)
    }
  }

  const handleCyclePriority = () => {
    if (!taskShape) return
    const cur = taskShape.props.priority || 3
    const next = cur === 1 ? 2 : cur === 2 ? 3 : cur === 3 ? 4 : 1
    updateTaskProps({ priority: next })
  }

  const handleSaveTitle = () => {
    setIsEditingTitle(false)
    if (taskShape && titleDraft.trim()) {
      updateTaskProps({ title: titleDraft.trim() })
    }
  }

  const handleSaveNotes = () => {
    setIsEditingNotes(false)
    if (taskShape) {
      updateTaskProps({ notes: notesDraft })
    }
  }

  const handleNotesCheckboxClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target && target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
      const idxStr = target.getAttribute('data-task-checkbox')
      if (idxStr !== null) {
        const idx = parseInt(idxStr, 10)
        if (!isNaN(idx) && taskShape) {
          const updated = toggleCheckboxInMarkdown(taskShape.props.notes || '', idx)
          updateTaskProps({ notes: updated })
          setNotesDraft(updated)
        }
      }
    }
  }

  const handleAddMinutes = (min: number) => {
    const addSec = min * 60
    setSecondsRemaining((prev) => prev + addSec)
    setTotalSeconds((prev) => prev + addSec)
  }

  const handleResetTimer = () => {
    setSecondsRemaining(25 * 60)
    setTotalSeconds(25 * 60)
    setIsRunning(true)
  }

  const handleOpenInlineChat = () => {
    if (!activeShapeId) return
    window.dispatchEvent(
      new CustomEvent('foqz:open-inline-chat', {
        detail: { shapeId: activeShapeId },
      }),
    )
  }

  if (!activeShapeId || !activeShape) return null

  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  const currentPriority = taskShape?.props.priority || 3
  const priorityConfig = PRIORITY_CONFIG[currentPriority] || PRIORITY_CONFIG[3]
  const isTaskDone = taskShape?.props.status === 'done'

  const progressPercent = totalSeconds > 0 ? Math.min(100, Math.max(0, ((totalSeconds - secondsRemaining) / totalSeconds) * 100)) : 0

  return (
    <>
      {/* Deeply Grayed & Blurred Background Backdrop (Everything else recedes into darkness) */}
      {isLocked && (
        <div
          className="fixed inset-0 z-[6000] pointer-events-auto transition-all duration-500"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'grayscale(90%) blur(8px) brightness(0.45)',
            WebkitBackdropFilter: 'grayscale(90%) blur(8px) brightness(0.45)',
          }}
          onClick={() => {
            // Clicking background keeps focus centered
          }}
        />
      )}

      {/* Top Status Strip */}
      <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[6200] flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-950/80 text-white border border-zinc-800/80 shadow-xl backdrop-blur-md select-none animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isRunning && !isTaskDone && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isTaskDone ? 'bg-emerald-500' : isRunning ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-300 font-mono">
            {isTaskDone ? 'Task Completed' : isRunning ? 'Mono-Focus Sprint' : 'Session Paused'}
          </span>
        </div>

        <span className="text-zinc-600">|</span>

        {/* Unlock / Exit Button */}
        <button
          type="button"
          onClick={() => setShowExitModal(true)}
          className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer"
        >
          <Lock className="size-3 text-zinc-500" />
          <span>Exit Focus (Esc)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* CENTER-FRONT HERO FOCUS CARD (Crisp, un-grayed, illuminated on center stage) */}
      {/* ========================================================================= */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[6100] w-full max-w-xl px-4 pointer-events-auto select-none">
        <div className="w-full rounded-2xl bg-zinc-950 text-zinc-100 border border-zinc-700/80 shadow-[0_0_90px_rgba(0,0,0,0.9),0_0_40px_rgba(16,185,129,0.18)] ring-1 ring-white/15 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 backdrop-blur-xl">
          {/* Card Header Strip */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-900/60">
            {/* Left: Project Badge & Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0">
              {containingProject ? (
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20 truncate max-w-[240px]"
                  title={`Belongs to Project: ${containingProject.props.title}`}
                >
                  <FolderGit2 className="size-3 text-blue-400 shrink-0" />
                  <span className="truncate">{containingProject.props.title}</span>
                </div>
              ) : (
                <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
                  Active Canvas Task
                </span>
              )}
            </div>

            {/* Right: Priority & Status Selectors */}
            {taskShape && (
              <div className="flex items-center gap-2 shrink-0">
                {/* Priority Pill */}
                <button
                  type="button"
                  onClick={handleCyclePriority}
                  title="Click to cycle priority (P1 Urgent -> P2 High -> P3 Normal -> P4 Low)"
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${priorityConfig.bg} ${priorityConfig.text} ${priorityConfig.border}`}
                >
                  <span className={`size-1.5 rounded-full ${priorityConfig.dot}`} />
                  <span>{priorityConfig.label}</span>
                </button>

                {/* Status Toggle */}
                <button
                  type="button"
                  onClick={handleToggleDone}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 cursor-pointer ${
                    isTaskDone
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {isTaskDone ? (
                    <>
                      <Check className="size-3 text-emerald-400" />
                      <span>Done</span>
                    </>
                  ) : (
                    <span>In Progress</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Main Card Content */}
          <div className="p-6 space-y-5">
            {/* Title Section */}
            <div className="space-y-1">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle()
                      if (e.key === 'Escape') setIsEditingTitle(false)
                    }}
                    autoFocus
                    className="w-full text-lg sm:text-xl font-bold text-white bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveTitle}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 group">
                  <h2
                    onDoubleClick={() => setIsEditingTitle(true)}
                    className={`text-xl sm:text-2xl font-bold tracking-tight text-white leading-snug ${
                      isTaskDone ? 'line-through text-zinc-400' : ''
                    }`}
                  >
                    {shapeTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    title="Edit Title"
                    className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                  >
                    <Edit3 className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Prominent Pomodoro Timer Box */}
            <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500">
                    Remaining Time
                  </span>
                  <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-white">
                    {formattedTime}
                  </span>
                </div>

                {/* Play / Pause Toggle */}
                <button
                  type="button"
                  onClick={() => setIsRunning(!isRunning)}
                  className="size-10 rounded-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white flex items-center justify-center transition-all shadow-md cursor-pointer shrink-0"
                  title={isRunning ? 'Pause Timer' : 'Resume Timer'}
                >
                  {isRunning ? <Pause className="size-4" /> : <Play className="size-4 ml-0.5" />}
                </button>
              </div>

              {/* Timer Presets & Reset */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddMinutes(5)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
                >
                  +5m
                </button>
                <button
                  type="button"
                  onClick={() => handleAddMinutes(15)}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
                >
                  +15m
                </button>
                <button
                  type="button"
                  onClick={handleResetTimer}
                  title="Reset timer to 25m"
                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Focus Session Progress Bar */}
            <div className="w-full space-y-1">
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>Progress</span>
                <span>{Math.round(progressPercent)}% elapsed</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Checklist & Notes Section */}
            {taskShape && (
              <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
                  <span>Action Items & Notes</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes((prev) => !prev)}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="size-3" />
                    <span>{isEditingNotes ? 'Done Editing' : 'Edit Markdown'}</span>
                  </button>
                </div>

                {isEditingNotes ? (
                  <div className="space-y-2">
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder={`- [ ] First concrete step\n- [ ] Second verification step\nNotes or technical details...`}
                      rows={5}
                      className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-mono text-white placeholder:text-zinc-500 outline-none focus:border-emerald-500 resize-y"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveNotes}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        Save Notes
                      </button>
                    </div>
                  </div>
                ) : taskShape.props.notes?.trim() ? (
                  <div
                    onClick={handleNotesCheckboxClick}
                    className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-200 max-h-44 overflow-y-auto leading-relaxed ai-markdown space-y-1.5 cursor-pointer"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownBlock(taskShape.props.notes),
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingNotes(true)}
                    className="w-full py-3 px-4 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 text-xs text-zinc-500 hover:text-zinc-300 text-left transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="size-3.5" />
                    <span>Add checklist items (- [ ] step) or session notes...</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Bottom Action Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 bg-zinc-900/80">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenInlineChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors cursor-pointer"
              >
                <Sparkles className="size-3.5 text-blue-400" />
                <span>AI Partner (C)</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {isTaskDone ? (
                <button
                  type="button"
                  onClick={handleForceUnlock}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="size-4" />
                  <span>Completed! Exit Focus</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleDone}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-md transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="size-4" />
                  <span>Mark as Completed</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Exit Friction Modal */}
      {showExitModal && (
        <div
          className="fixed inset-0 z-[7500] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowExitModal(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 text-zinc-900 dark:text-zinc-100 flex flex-col gap-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Active Focus Session in Progress</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  You are working on <span className="font-semibold text-foreground">"{shapeTitle}"</span>.
                  Leaving early breaks your flow state.
                </p>
              </div>
            </div>

            {/* Option A: State reason (evaluated for focus integrity) */}
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Are you unlocking for a necessary dependency or task lookup?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Need to verify API response on Stripe dashboard"
                  value={exitReason}
                  onChange={(e) => setExitReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleEvaluateReason()
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  disabled={!exitReason.trim() || isEvaluatingExit}
                  onClick={() => void handleEvaluateReason()}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {isEvaluatingExit ? 'Evaluating...' : 'Verify'}
                </button>
              </div>
              {exitFeedback && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">
                  {exitFeedback}
                </p>
              )}
            </div>

            {/* Option B: Hold Esc for 3s */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Hold <b>Esc</b> for 3 seconds to force unlock:</span>
                <span className="font-mono">{Math.round(holdProgress)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-rose-500 transition-all duration-75"
                  style={{ width: `${holdProgress}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Return to Focus
              </button>
              <button
                type="button"
                onClick={handleForceUnlock}
                className="text-xs text-rose-500 hover:underline"
              >
                Force End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
