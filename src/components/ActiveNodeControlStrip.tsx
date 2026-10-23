import React, { useMemo } from 'react'
import {
  CheckCircle2,
  Play,
  Pause,
  X,
  Plus,
  FolderGit2,
  Layers,
  Sparkles,
  Target,
  Check,
  CheckSquare,
  MessageSquare,
} from 'lucide-react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import { extractChecklistStats } from '@/lib/markdown'
import {
  isActionable,
  isDone,
  isTextNode,
  nodeTitle,
  startFocus,
  stopFocus,
  toggleActionable,
  toggleDone,
} from '@/lib/nodeBehaviors'

interface ActiveNodeControlStripProps {
  nodeId: string | null
  isCanvasScope: boolean
}

const PROJECT_ACCENTS = [
  { id: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'indigo', label: 'Indigo', dot: 'bg-indigo-500' },
]

const STRIP_CLASS =
  'px-3 py-1.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between text-xs select-none gap-2'

function AnnotateButton({ nodeId, title }: { nodeId: string; title: string }) {
  const count = useFlowCanvasStore(
    (s) =>
      Object.values(s.annotations || {}).filter(
        (a) => a.anchor.nodeId === nodeId && a.status === 'open'
      ).length
  )
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent('foqz:open-annotation-composer', { detail: { nodeId } })
        )
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-black/10 dark:border-white/10 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer"
      title={title}
    >
      <MessageSquare className="size-2.5" />
      <span>Annotate</span>
      {count > 0 && (
        <span className="px-1 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white leading-none">
          {count}
        </span>
      )}
    </button>
  )
}

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
  const setIsTimerRunning = useFlowCanvasStore((s) => s.setIsTimerRunning)
  const updateNodeData = useFlowCanvasStore((s) => s.updateNodeData)

  const formattedTimer = useMemo(() => {
    const mins = Math.floor(timerSecondsRemaining / 60)
    const secs = timerSecondsRemaining % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }, [timerSecondsRemaining])

  const todoStats = (nodes: typeof allNodes) => {
    const todos = nodes.filter((n) => isActionable(n))
    const done = todos.filter((n) => isDone(n)).length
    return {
      total: todos.length,
      done,
      percent: todos.length > 0 ? Math.round((done / todos.length) * 100) : 0,
    }
  }

  const addTextInside = (parentId?: string) => {
    window.dispatchEvent(new CustomEvent('foqz:new-text', { detail: { text: '' } }))
    if (parentId) {
      // createText adopts into whichever region is under the cursor; fall back to the region's corner.
      const store = useFlowCanvasStore.getState()
      const created = store.nodes.find((n) => n.id === store.selectedNodeId)
      if (created && !created.parentId) {
        store.setNodes((nds) =>
          nds.map((n) => (n.id === created.id ? { ...n, parentId, position: { x: 40, y: 80 } } : n))
        )
      }
    }
  }

  // Text (any style)
  if (node && isTextNode(node)) {
    const data = (node.data || {}) as Record<string, any>
    const actionable = isActionable(node)
    const done = isDone(node)
    const isFocused = activeFocusNodeId === node.id
    const checklistStats = extractChecklistStats(data.notes || data.text || '')
    const parentNode = node.parentId ? allNodes.find((n) => n.id === node.parentId) : null

    return (
      <div className={STRIP_CLASS}>
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {actionable ? (
            <button
              type="button"
              onClick={() => toggleDone(node.id)}
              title={done ? 'Mark open' : 'Mark done'}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer shrink-0 ${
                done
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {done ? <CheckCircle2 className="size-2.5" /> : <span className="size-1.5 rounded-full bg-zinc-400" />}
              <span>{done ? 'Done' : 'Open'}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('foqz:flow-center-on', { detail: { id: node.id } }))
            }
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer truncate max-w-[180px] sm:max-w-[240px] text-zinc-900 dark:text-zinc-100 font-semibold text-[11px]"
            title="Center on this"
          >
            <span className="truncate">{nodeTitle(node) || 'Untitled'}</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 min-w-0 flex-1 justify-center px-2">
          {parentNode ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 shrink-0">
              <FolderGit2 className="size-2.5" />
              <span>{(parentNode.data as any)?.title || 'Region'}</span>
            </span>
          ) : null}
          {checklistStats.total > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 text-[11px] truncate max-w-[360px]">
              <Sparkles className="size-2.5 text-zinc-400 shrink-0" />
              {checklistStats.nextPendingItem ? (
                <span className="truncate text-zinc-800 dark:text-zinc-200 font-medium">
                  Next: {checklistStats.nextPendingItem}
                </span>
              ) : null}
              <span className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 shrink-0">
                {checklistStats.done}/{checklistStats.total}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <AnnotateButton nodeId={node.id} title="Annotate" />

          {!actionable && (
            <button
              type="button"
              onClick={() => toggleActionable(node.id)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Make it a to-do (⌘↵)"
            >
              <CheckSquare className="size-2.5" />
              <span>To-do</span>
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
                onClick={() => {
                  updateNodeData(node.id, { status: 'done', completedVia: 'focus' })
                  stopFocus()
                }}
                title="Mark done"
                className="ml-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-500 hover:bg-emerald-600 text-white font-sans text-[9px] font-medium cursor-pointer"
              >
                <Check className="size-2.5 stroke-[3]" />
                <span>Done</span>
              </button>
              <button
                type="button"
                onClick={() => stopFocus()}
                title="Leave focus"
                className="hover:text-rose-800 dark:hover:text-rose-200 cursor-pointer p-0.5"
              >
                <X className="size-2.5 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => startFocus(node.id)}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs cursor-pointer"
              title="Focus here (F)"
            >
              <Target className="size-2.5" />
              <span>Focus</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // Region
  if (node?.type === 'projectFrame') {
    const regionData = (node.data || {}) as Record<string, any>
    const accent = regionData.accent || 'blue'
    const stats = todoStats(allNodes.filter((n) => n.parentId === node.id))

    return (
      <div className={STRIP_CLASS}>
        <div className="flex items-center gap-2">
          <FolderGit2 className="size-3.5 text-blue-500 shrink-0" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
              {stats.done}/{stats.total} to-dos done
            </span>
            <div className="w-14 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${stats.percent}%` }}
              />
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-black/[0.08] dark:border-white/[0.08]">
            {PROJECT_ACCENTS.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => updateNodeData(node.id, { accent: acc.id })}
                title={`Color: ${acc.label}`}
                className={`size-2.5 rounded-full transition-transform cursor-pointer ${acc.dot} ${
                  accent === acc.id ? 'ring-1.5 ring-blue-500 scale-125' : 'opacity-60 hover:opacity-100 hover:scale-110'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <AnnotateButton nodeId={node.id} title="Annotate this region" />
          <button
            type="button"
            onClick={() => addTextInside(node.id)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="size-2.5" />
            <span>Text</span>
          </button>
        </div>
      </div>
    )
  }

  // Whole board
  if (isCanvasScope) {
    const regions = allNodes.filter((n) => n.type === 'projectFrame').length
    const stats = todoStats(allNodes)
    return (
      <div className={STRIP_CLASS}>
        <div className="flex items-center gap-2">
          <Layers className="size-3.5 text-rose-500 shrink-0" />
          <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
            {regions} regions • {stats.total} to-dos ({stats.done} done)
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => addTextInside()}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white transition-colors cursor-pointer"
          >
            <Plus className="size-2.5" />
            <span>Text</span>
          </button>
        </div>
      </div>
    )
  }

  return null
}
