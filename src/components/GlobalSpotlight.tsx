import React, { useState, useEffect, useRef, useMemo } from 'react'
import { type Editor, type TLShape, type TLShapeId } from 'tldraw'
import {
  Search,
  Sparkles,
  ArrowRight,
  Layers,
  Lock,
  Folder,
  CheckCircle2,
  StickyNote,
  Type,
  CornerDownLeft,
} from 'lucide-react'
import { extractTextFromShape } from '@/lib/canvasContext'
import { prioritizeDailyFocusSlot } from '@/lib/jev'

interface GlobalSpotlightProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
  onSelectFocusTarget: (shapeId: TLShapeId) => void
}

function getShapeBadge(type: string) {
  switch (type) {
    case 'project-frame':
      return {
        label: 'Project',
        icon: <Folder className="size-3 text-blue-500 shrink-0" />,
        badgeClass:
          'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/80',
      }
    case 'focus-task':
      return {
        label: 'Task',
        icon: <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />,
        badgeClass:
          'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80',
      }
    case 'note':
      return {
        label: 'Note',
        icon: <StickyNote className="size-3 text-amber-500 shrink-0" />,
        badgeClass:
          'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80',
      }
    case 'text':
      return {
        label: 'Text',
        icon: <Type className="size-3 text-zinc-500 dark:text-zinc-400 shrink-0" />,
        badgeClass:
          'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80',
      }
    default:
      return {
        label: type.replace('-', ' '),
        icon: <Layers className="size-3 text-zinc-500 dark:text-zinc-400 shrink-0" />,
        badgeClass:
          'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80',
      }
  }
}

export function GlobalSpotlight({
  editor,
  open,
  onClose,
  onSelectFocusTarget,
}: GlobalSpotlightProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'search' | 'prioritize'>('search')
  const [dailyGoal, setDailyGoal] = useState('')
  const [isPrioritizing, setIsPrioritizing] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [rankedItems, setRankedItems] = useState<
    Array<{
      id: string
      title: string
      alignmentScore: number
      blastRadius: string
      isActionable: boolean
    }>
  >([])

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setMode('search')
      setRankedItems([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Collect all searchable shapes and frames from the canvas
  const searchableShapes = useMemo(() => {
    if (!editor) return []
    const all = editor.getCurrentPageShapes()
    const results: Array<{ id: TLShapeId; text: string; type: string; shape: TLShape }> = []

    for (const s of all) {
      if (s.type === 'arrow') continue
      let text = extractTextFromShape(s)
      if (!text.trim() && s.type === 'project-frame') {
        text = 'Untitled Project'
      }
      if (text.trim()) {
        results.push({
          id: s.id,
          text: text.trim(),
          type: s.type,
          shape: s,
        })
      }
    }

    // Sort: projects first, then tasks, then other shapes
    results.sort((a, b) => {
      const typeRank = (t: string) => (t === 'project-frame' ? 0 : t === 'focus-task' ? 1 : 2)
      return typeRank(a.type) - typeRank(b.type)
    })

    return results
  }, [editor, open])

  // Simple fuzzy text filtering
  const filteredShapes = useMemo(() => {
    if (!query.trim()) {
      // Prioritize projects first, then recent items
      const projects = searchableShapes.filter((s) => s.type === 'project-frame')
      const others = searchableShapes.filter((s) => s.type !== 'project-frame')
      return [...projects, ...others].slice(0, 15)
    }
    const q = query.toLowerCase()
    return searchableShapes
      .filter((s) => s.text.toLowerCase().includes(q) || s.type.toLowerCase().includes(q))
      .slice(0, 20)
  }, [searchableShapes, query])

  // Reset selected index when query or results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query, mode])

  // Auto-scroll the active keyboard selection into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Global Escape key handler when modal is open
  useEffect(() => {
    if (!open) return
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [open, onClose])

  const handleSelectShape = (shapeId: TLShapeId) => {
    if (!editor) return
    const shape = editor.getShape(shapeId)
    const bounds = editor.getShapePageBounds(shapeId)
    if (bounds) {
      if (shape && shape.type === 'project-frame') {
        // Frame project cleanly without over-magnifying
        editor.zoomToBounds(bounds, {
          animation: { duration: 300 },
          inset: 80,
        })
      } else {
        editor.zoomToBounds(bounds, {
          targetZoom: 1.1,
          animation: { duration: 300 },
          inset: 80,
        })
      }
      editor.select(shapeId)
    }
    onClose()
  }

  const handleStartFocusSession = (shapeId: TLShapeId) => {
    handleSelectShape(shapeId)
    onSelectFocusTarget(shapeId)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredShapes.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredShapes[selectedIndex]) {
        handleSelectShape(filteredShapes[selectedIndex].id)
      }
    }
  }

  const handleRunPrioritize = async () => {
    if (!dailyGoal.trim() || !editor) return
    setIsPrioritizing(true)

    try {
      const candidates = searchableShapes.map((s) => ({
        id: s.id as string,
        title: s.text,
      }))

      const result = await prioritizeDailyFocusSlot(dailyGoal, candidates)
      setRankedItems(result.rankings)
    } catch (err: any) {
      alert(`Prioritization failed: ${err.message || String(err)}`)
    } finally {
      setIsPrioritizing(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[7000] flex items-start justify-center pt-20 sm:pt-24 bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mode Switcher Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/40 select-none">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                mode === 'search'
                  ? 'bg-white dark:bg-zinc-800 text-foreground shadow-xs'
                  : 'text-zinc-500 hover:text-foreground'
              }`}
            >
              Jump & Search
            </button>
            <button
              type="button"
              onClick={() => setMode('prioritize')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                mode === 'prioritize'
                  ? 'bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-zinc-500 hover:text-foreground'
              }`}
            >
              <Sparkles className="size-3" />
              <span>Prioritize My Day</span>
            </button>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">Esc to close</span>
        </div>

        {mode === 'search' ? (
          <>
            {/* Search Input Bar */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <Search className="size-4 text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Jump to project, task, or search canvas..."
                className="w-full bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-zinc-400"
              />
            </div>

            {/* Results List */}
            <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1">
              {filteredShapes.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">
                  No matching projects, tasks, or shapes found on this board.
                </div>
              ) : (
                filteredShapes.map((item, index) => {
                  const badge = getShapeBadge(item.type)
                  const isSelected = index === selectedIndex
                  const isProject = item.type === 'project-frame'
                  const isTask = item.type === 'focus-task'

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl transition-all group cursor-pointer border ${
                        isSelected
                          ? 'bg-zinc-100 dark:bg-zinc-800/90 border-zinc-300 dark:border-zinc-700 shadow-2xs'
                          : 'border-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50'
                      }`}
                      onClick={() => handleSelectShape(item.id)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase shrink-0 border ${badge.badgeClass}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                        <span className="font-medium text-foreground truncate text-xs">
                          {item.text}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartFocusSession(item.id)
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium hover:bg-emerald-200 transition-colors opacity-0 group-hover:opacity-100"
                            title="Start Focus Session"
                          >
                            <Lock className="size-2.5" />
                            <span>Focus</span>
                          </button>
                        )}

                        {isProject && (
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            Jump <ArrowRight className="size-3 ml-0.5 inline" />
                          </span>
                        )}

                        {isSelected && (
                          <span className="text-zinc-400 dark:text-zinc-500 flex items-center">
                            <CornerDownLeft className="size-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer with keyboard navigation hints */}
            <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 select-none">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 px-1 py-0.2 rounded text-[10px]">
                    ↑↓
                  </kbd>{' '}
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 px-1 py-0.2 rounded text-[10px]">
                    ↵
                  </kbd>{' '}
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 px-1 py-0.2 rounded text-[10px]">
                    esc
                  </kbd>{' '}
                  close
                </span>
              </div>
              {filteredShapes.length > 0 && (
                <span className="text-[10px] text-zinc-400 font-mono">
                  {filteredShapes.length} {filteredShapes.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </div>
          </>
        ) : (
          /* Daily Prioritization Mode */
          <div className="p-4 flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-foreground">
                What is your #1 outcome or goal for today?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Ship billing checkout v2 and resolve production crash"
                  value={dailyGoal}
                  onChange={(e) => setDailyGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRunPrioritize()
                  }}
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  disabled={!dailyGoal.trim() || isPrioritizing}
                  onClick={() => void handleRunPrioritize()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isPrioritizing ? 'Evaluating priorities...' : 'Prioritize Backlog'}
                </button>
              </div>
            </div>

            {rankedItems.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-zinc-500 font-medium text-[11px]">
                  <span>Recommended Sequence:</span>
                  <span>{rankedItems.length} candidate items evaluated</span>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-1.5">
                  {rankedItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        idx === 0
                          ? 'border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm'
                          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`size-5 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${
                            idx === 0
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-foreground truncate">{item.title}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                            <span className="capitalize">{item.blastRadius.replace('_', ' ')}</span>
                            <span>•</span>
                            <span>{item.isActionable ? 'Actionable 1-slot' : 'Multi-step'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartFocusSession(item.id as TLShapeId)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                          idx === 0
                            ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-xs'
                            : 'bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-foreground'
                        }`}
                      >
                        <Lock className="size-3" />
                        <span>{idx === 0 ? 'Lock Into Focus' : 'Focus'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
