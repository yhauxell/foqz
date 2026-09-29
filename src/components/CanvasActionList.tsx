import React, { useState } from 'react'
import {
  CheckSquare,
  StickyNote,
  Clock,
  Sparkles,
  ArrowRight,
  Plus,
  Check,
  GitFork,
  Link2,
  FolderGit2,
  Edit2,
} from 'lucide-react'
import type { SpawnableShape } from '@/lib/canvasSpawner'
import { renderMarkdownInline } from '@/lib/markdown'

export interface SpawnTreeOptions {
  linkMode?: 'chain' | 'fanout'
  selectedIndices?: number[]
  editedTitles?: Record<number, string>
}

interface CanvasActionListProps {
  actions: SpawnableShape[]
  onSpawnAll: (options?: SpawnTreeOptions) => void
  onSpawnSingle?: (action: SpawnableShape, index: number) => void
  spawnedCount?: number | null
  parentTask?: {
    id: string
    title: string
  } | null
}

const PRIORITY_BADGES: Record<
  number,
  { label: string; bg: string; text: string; border: string }
> = {
  1: {
    label: 'P1 • Urgent',
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-900/60',
  },
  2: {
    label: 'P2 • High',
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-900/60',
  },
  3: {
    label: 'P3 • Normal',
    bg: 'bg-blue-500/10 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-900/60',
  },
  4: {
    label: 'P4 • Low',
    bg: 'bg-zinc-500/10 dark:bg-zinc-500/20',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-200 dark:border-zinc-800',
  },
}

const NOTE_COLORS: Record<string, { dot: string; label: string }> = {
  yellow: { dot: 'bg-amber-400', label: 'Yellow' },
  blue: { dot: 'bg-sky-400', label: 'Blue' },
  green: { dot: 'bg-emerald-400', label: 'Green' },
  pink: { dot: 'bg-pink-400', label: 'Pink' },
  red: { dot: 'bg-red-400', label: 'Red' },
  black: { dot: 'bg-zinc-800', label: 'Black' },
  grey: { dot: 'bg-zinc-400', label: 'Grey' },
  violet: { dot: 'bg-blue-400', label: 'Blue' },
}

export function CanvasActionList({
  actions,
  onSpawnAll,
  onSpawnSingle,
  spawnedCount,
  parentTask,
}: CanvasActionListProps) {
  const [singleSpawnedIdx, setSingleSpawnedIdx] = useState<number | null>(null)
  const [linkMode, setLinkMode] = useState<'chain' | 'fanout'>('chain')
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(actions.map((_, i) => i))
  )
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editedTitles, setEditedTitles] = useState<Record<number, string>>({})

  if (!actions || actions.length === 0) return null

  const isSubtaskTree = Boolean(parentTask && actions.some((a) => a.type === 'task'))

  const toggleSelect = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        if (next.size > 1) next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  const handleSingleSpawn = (action: SpawnableShape, index: number) => {
    if (onSpawnSingle) {
      const finalAction = editedTitles[index]
        ? { ...action, title: editedTitles[index] }
        : action
      onSpawnSingle(finalAction, index)
      setSingleSpawnedIdx(index)
      setTimeout(() => setSingleSpawnedIdx(null), 2500)
    }
  }

  const handleSpawnAllTrigger = () => {
    onSpawnAll({
      linkMode,
      selectedIndices: Array.from(selectedIndices),
      editedTitles,
    })
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3 space-y-2.5 font-sans my-2.5 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-blue-500" />
          <span className="text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {isSubtaskTree ? 'Subtask Hierarchy Staging' : 'Proposed Canvas Items'}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
            {isSubtaskTree ? `${selectedIndices.size}/${actions.length}` : actions.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Link Mode Switcher if Subtask Tree */}
          {isSubtaskTree && (
            <div className="flex items-center rounded-full bg-zinc-200/70 dark:bg-zinc-800 p-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 select-none">
              <button
                type="button"
                onClick={() => setLinkMode('chain')}
                title="Serial chain: Parent -> Subtask 1 -> Subtask 2"
                className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                  linkMode === 'chain'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                    : 'hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Link2 className="size-2.5" />
                <span>Chain</span>
              </button>
              <button
                type="button"
                onClick={() => setLinkMode('fanout')}
                title="Parallel fan-out: Parent connects to each subtask directly"
                className={`px-2 py-0.5 rounded-full transition-colors cursor-pointer flex items-center gap-1 ${
                  linkMode === 'fanout'
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                    : 'hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <GitFork className="size-2.5" />
                <span>Fan-out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleSpawnAllTrigger}
            className="inline-flex items-center gap-1.5 h-6.5 px-3 rounded-full text-[11px] font-medium bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-950 transition-colors shadow-2xs cursor-pointer select-none"
          >
            <span>{isSubtaskTree ? 'Spawn Tree' : 'Spawn All'}</span>
            <ArrowRight className="size-3" />
          </button>
        </div>
      </div>

      {/* Parent Reference Indicator if Subtask Tree */}
      {isSubtaskTree && parentTask && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
          <span className="font-semibold shrink-0">Parent Node:</span>
          <span className="truncate font-medium">&quot;{parentTask.title}&quot;</span>
          <span className="text-[10px] text-blue-500/80 font-mono ml-auto shrink-0">
            {linkMode === 'chain' ? 'Linked sequentially' : 'Linked in parallel'}
          </span>
        </div>
      )}

      {/* Structured Elements List */}
      <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70 border border-zinc-200 dark:border-zinc-800/80 rounded-lg overflow-hidden bg-white dark:bg-zinc-950/80">
        {actions.map((action, index) => {
          const isItemSpawned = singleSpawnedIdx === index
          const isSelected = selectedIndices.has(index)
          const currentTitle = editedTitles[index] !== undefined ? editedTitles[index] : (action.title || action.text || '')

          if (action.type === 'task') {
            const prio =
              typeof action.priority === 'number' && action.priority in PRIORITY_BADGES
                ? PRIORITY_BADGES[action.priority]
                : PRIORITY_BADGES[3]

            return (
              <div
                key={index}
                className={`p-2.5 flex items-center justify-between gap-2.5 transition-colors group ${
                  isSelected ? 'hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40' : 'opacity-40 bg-zinc-50/40 dark:bg-zinc-900/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Selection checkbox if subtask tree */}
                  {isSubtaskTree && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(index)}
                      className="size-3.5 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-0 cursor-pointer shrink-0"
                    />
                  )}

                  <span className="text-[10px] font-mono text-zinc-400 select-none shrink-0">
                    #{index + 1}
                  </span>

                  <span
                    className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border shrink-0 ${prio.bg} ${prio.text} ${prio.border}`}
                  >
                    {prio.label}
                  </span>

                  {/* Editable or formatted title */}
                  {editingIdx === index ? (
                    <input
                      type="text"
                      value={currentTitle}
                      autoFocus
                      onChange={(e) => setEditedTitles((prev) => ({ ...prev, [index]: e.target.value }))}
                      onBlur={() => setEditingIdx(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setEditingIdx(null)
                      }}
                      className="flex-1 text-xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-blue-400 outline-none font-medium text-zinc-900 dark:text-zinc-100"
                    />
                  ) : (
                    <span
                      onClick={() => setEditingIdx(index)}
                      title="Click to edit title before spawning"
                      className="text-xs text-zinc-800 dark:text-zinc-200 font-medium truncate cursor-text hover:underline decoration-zinc-400 flex items-center gap-1"
                    >
                      <span
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdownInline(currentTitle || 'New Task'),
                        }}
                      />
                      <Edit2 className="size-2.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  title="Spawn this task onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            )
          }

          if (action.type === 'note') {
            const colorKey = action.color || 'yellow'
            const colorMeta = NOTE_COLORS[colorKey] || NOTE_COLORS.yellow

            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <StickyNote className="size-3.5 text-amber-500 shrink-0" />
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 shrink-0">
                    <span className={`size-1.5 rounded-full ${colorMeta.dot}`} />
                    <span>{colorMeta.label} Note</span>
                  </span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    {action.text || action.title || 'Note'}
                  </span>
                </div>

                <button
                  type="button"
                  title="Spawn this note onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            )
          }

          if (action.type === 'project') {
            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <FolderGit2 className="size-3.5 text-blue-500 shrink-0" />
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-900/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-medium shrink-0">
                    Project Frame
                  </span>
                  <span className="text-xs text-zinc-800 dark:text-zinc-200 font-medium truncate">
                    {action.title || 'Project'}
                  </span>
                </div>

                <button
                  type="button"
                  title="Spawn this project onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            )
          }

          if (action.type === 'timer') {
            const minutes = action.minutes || 15

            return (
              <div
                key={index}
                className="p-2.5 flex items-center justify-between gap-2.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Clock className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-medium shrink-0">
                    {minutes}m Timer
                  </span>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">
                    Focus Countdown ({minutes} minutes)
                  </span>
                </div>

                <button
                  type="button"
                  title="Spawn this timer onto canvas"
                  onClick={() => handleSingleSpawn(action, index)}
                  className="shrink-0 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {isItemSpawned ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </button>
              </div>
            )
          }

          return null
        })}
      </div>

      {/* Spawn Status Feedback */}
      {spawnedCount !== null && spawnedCount !== undefined && spawnedCount > 0 ? (
        <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
          <Check className="size-3.5" />
          <span>Spawned {spawnedCount} items onto the canvas!</span>
        </div>
      ) : null}
    </div>
  )
}
