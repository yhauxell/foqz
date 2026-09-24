import React, { useState, useEffect, useRef, useMemo } from 'react'
import { type Editor, type TLShape, type TLShapeId } from 'tldraw'
import { Search, Target, Sparkles, ArrowRight, Layers, Lock, Flame, Check } from 'lucide-react'
import { extractTextFromShape, getCanvasContext } from '@/lib/canvasContext'
import { prioritizeDailyFocusSlot, semanticQueryShapes } from '@/lib/jev'

interface GlobalSpotlightProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
  onSelectFocusTarget: (shapeId: TLShapeId) => void
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
  const [rankedItems, setRankedItems] = useState<Array<{
    id: string
    title: string
    alignmentScore: number
    blastRadius: string
    isActionable: boolean
  }>>([])

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setMode('search')
      setRankedItems([])
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
      const text = extractTextFromShape(s)
      if (text.trim()) {
        results.push({
          id: s.id,
          text: text.trim(),
          type: s.type,
          shape: s,
        })
      }
    }
    return results
  }, [editor, open])

  // Simple fuzzy text filtering
  const filteredShapes = useMemo(() => {
    if (!query.trim()) return searchableShapes.slice(0, 8)
    const q = query.toLowerCase()
    return searchableShapes
      .filter((s) => s.text.toLowerCase().includes(q) || s.type.toLowerCase().includes(q))
      .slice(0, 10)
  }, [searchableShapes, query])

  const handleSelectShape = (shapeId: TLShapeId) => {
    if (!editor) return
    const bounds = editor.getShapePageBounds(shapeId)
    if (bounds) {
      editor.zoomToBounds(bounds, {
        targetZoom: 1.1,
        animation: { duration: 300 },
      })
      editor.select(shapeId)
    }
    onClose()
  }

  const handleStartFocusSession = (shapeId: TLShapeId) => {
    handleSelectShape(shapeId)
    onSelectFocusTarget(shapeId)
    onClose()
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
      className="fixed inset-0 z-[7000] flex items-start justify-center pt-24 bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mode Switcher Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                mode === 'search'
                  ? 'bg-white dark:bg-zinc-800 text-foreground shadow-xs'
                  : 'text-zinc-500 hover:text-foreground'
              }`}
            >
              Search Shapes
            </button>
            <button
              type="button"
              onClick={() => setMode('prioritize')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
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
                placeholder="Search projects, hand-drawn ideas, or notes..."
                className="w-full bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-zinc-400"
              />
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {filteredShapes.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  No matching shapes found on this board.
                </div>
              ) : (
                filteredShapes.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors group cursor-pointer"
                    onClick={() => handleSelectShape(item.id)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                        {item.type}
                      </span>
                      <span className="font-medium text-foreground truncate">
                        {item.text}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartFocusSession(item.id)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium hover:bg-emerald-200 transition-colors"
                      >
                        <Lock className="size-2.5" />
                        <span>Focus</span>
                      </button>
                      <span className="text-zinc-400">
                        <ArrowRight className="size-3.5" />
                      </span>
                    </div>
                  </div>
                ))
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
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs transition-colors disabled:opacity-40"
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
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
