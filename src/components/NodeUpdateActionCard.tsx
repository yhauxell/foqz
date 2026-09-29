import React, { useState } from 'react'
import {
  CheckCircle2,
  Undo2,
  FileText,
  Sparkles,
  Check,
  X,
  Target,
  Wrench,
  ArrowRight,
  GitCommit,
} from 'lucide-react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import { renderMarkdownInline } from '@/lib/markdown'
import type { AgentToolCallEvent } from '@/lib/mcpAgentLoop'
import type { ProposedNodeUpdate } from '@/lib/canvasSpawner'

export interface ExecutedToolDiffCardProps {
  toolCall: AgentToolCallEvent
  nodeId?: string | null
}

const PRIORITY_LABELS: Record<number, string> = {
  1: 'P1 Urgent',
  2: 'P2 High',
  3: 'P3 Normal',
  4: 'P4 Low',
}

/**
 * Renders a visual diff card when the model executes update_node via tool call.
 */
export function ExecutedToolDiffCard({ toolCall, nodeId }: ExecutedToolDiffCardProps) {
  const [reverted, setReverted] = useState(false)
  const args = toolCall.arguments || {}
  const targetId = args.nodeId || args.taskId || nodeId

  const allNodes = useFlowCanvasStore((s) => s.nodes)
  const targetNode = allNodes.find((n) => n.id === targetId)
  const targetTitle = (targetNode?.data as any)?.title || args.title || targetId || 'Active Card'

  const handleUndo = () => {
    try {
      useFlowCanvasStore.temporal.getState().undo()
      setReverted(true)
    } catch (err) {
      console.error('Failed to undo canvas state:', err)
    }
  }

  // Extract changes
  const changedFields: Array<{ label: string; value: string; isAdd?: boolean }> = []
  if (args.title !== undefined) {
    changedFields.push({ label: 'Title', value: String(args.title) })
  }
  if (args.status !== undefined) {
    changedFields.push({ label: 'Status', value: String(args.status) })
  }
  if (args.priority !== undefined) {
    const pNum = Number(args.priority)
    changedFields.push({ label: 'Priority', value: PRIORITY_LABELS[pNum] || `P${pNum}` })
  }
  if (args.paper !== undefined) {
    changedFields.push({ label: 'Paper', value: String(args.paper) })
  }
  if (args.appendNotes !== undefined) {
    changedFields.push({
      label: 'Added Checkpoints',
      value: String(args.appendNotes),
      isAdd: true,
    })
  } else if (args.notes !== undefined) {
    changedFields.push({ label: 'Updated Notes', value: String(args.notes) })
  }

  if (changedFields.length === 0) return null

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/20 p-3 space-y-2 text-xs font-sans my-2 select-text shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between select-none">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-emerald-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px]">
            Card Mutated: &quot;{targetTitle}&quot;
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
            update_node
          </span>
        </div>

        {reverted ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
            <Check className="size-3" />
            <span>Reverted</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleUndo}
            title="Revert this mutation (Undo)"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200/80 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            <Undo2 className="size-2.5" />
            <span>Revert</span>
          </button>
        )}
      </div>

      {/* Changes list */}
      <div className="divide-y divide-emerald-500/10 rounded-lg bg-white/70 dark:bg-zinc-900/70 border border-emerald-500/15 overflow-hidden">
        {changedFields.map((cf, idx) => (
          <div key={idx} className="p-2 space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
              <span>{cf.label}</span>
            </div>
            {cf.isAdd ? (
              <div className="font-mono text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300 bg-emerald-500/5 p-1.5 rounded">
                {cf.value.split('\n').map((line, lIdx) => (
                  <div key={lIdx} className="flex items-start gap-1">
                    <span className="text-emerald-500 select-none font-bold">+</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] font-medium text-zinc-800 dark:text-zinc-200">
                {cf.value}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ProposedUpdateCardProps {
  update: ProposedNodeUpdate
  activeNodeId?: string | null
}

/**
 * Renders an interactive card when the assistant proposes an update block in text.
 * Allows 1-click [Apply to Task], [Append to Notes], or [Dismiss].
 */
export function ProposedUpdateCard({ update, activeNodeId }: ProposedUpdateCardProps) {
  const [applied, setApplied] = useState<'applied' | 'appended' | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const allNodes = useFlowCanvasStore((s) => s.nodes)
  const targetId = update.nodeId || activeNodeId
  const targetNode = allNodes.find((n) => n.id === targetId)
  const targetTitle = (targetNode?.data as any)?.title || targetId || 'Active Card'

  if (dismissed || !targetNode) return null

  const handleApply = () => {
    if (!targetId) return
    const store = useFlowCanvasStore.getState()
    const patch: Record<string, any> = {}
    if (update.title) patch.title = update.title
    if (update.priority) patch.priority = update.priority
    if (update.status) patch.status = update.status
    if (update.paper) patch.paper = update.paper
    if (update.goal) patch.goal = update.goal
    if (update.notes) patch.notes = update.notes

    store.updateNodeData(targetId, patch)

    if (patch.notes && targetNode.type === 'focusTask') {
      const lines = patch.notes.split('\n').filter(Boolean).length
      const autoHeight = Math.max(84, 84 + lines * 24)
      store.setNodes((nodes) =>
        nodes.map((n) => (n.id === targetId ? { ...n, style: { ...n.style, height: autoHeight } } : n))
      )
    }

    setApplied('applied')
  }

  const handleAppendNotes = () => {
    if (!targetId) return
    const store = useFlowCanvasStore.getState()
    const existing = ((targetNode?.data as any)?.notes as string) || ''
    const toAppend = update.appendNotes || update.notes || ''
    const merged = existing ? `${existing}\n\n${toAppend}` : toAppend

    store.updateNodeData(targetId, { notes: merged })

    const lines = merged.split('\n').filter(Boolean).length
    const autoHeight = Math.max(84, 84 + lines * 24)
    store.setNodes((nodes) =>
      nodes.map((n) => (n.id === targetId ? { ...n, style: { ...n.style, height: autoHeight } } : n))
    )

    setApplied('appended')
  }

  return (
    <div className="rounded-xl border border-blue-500/25 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-2.5 text-xs font-sans my-2.5 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between select-none">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-blue-500" />
          <span className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px]">
            Proposed Changes: &quot;{targetTitle}&quot;
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          title="Dismiss proposal"
          className="p-1 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Content Preview */}
      <div className="space-y-1.5 p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-blue-500/15">
        {update.title && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">Title:</span>
            <span className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100">
              {update.title}
            </span>
          </div>
        )}
        {update.priority && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-500 shrink-0">Priority:</span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
              {PRIORITY_LABELS[update.priority] || `P${update.priority}`}
            </span>
          </div>
        )}
        {(update.appendNotes || update.notes) && (
          <div className="space-y-1 pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-mono text-zinc-500">Checkpoints / Notes:</span>
            <div className="text-[11px] font-mono leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-950/60 p-2 rounded max-h-36 overflow-y-auto">
              {update.appendNotes || update.notes}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 select-none">
        {applied ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-3.5" />
            <span>Changes applied to card!</span>
          </span>
        ) : (
          <>
            {(update.appendNotes || update.notes) && (
              <button
                type="button"
                onClick={handleAppendNotes}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-blue-300 dark:border-blue-800 bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-colors shadow-2xs cursor-pointer"
              >
                + Append to Notes
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-medium bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 hover:bg-zinc-800 dark:hover:bg-white transition-colors shadow-2xs cursor-pointer"
            >
              <Check className="size-3" />
              <span>Apply Changes</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}
