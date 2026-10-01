import React, { useState, useEffect, useMemo } from 'react'
import { GitPullRequest, X, AlertCircle, Sparkles, Send, Check } from 'lucide-react'
import { createGitHubIssue } from '../lib/githubSync'
import { normalizeGithubRepoInput } from '../lib/githubAgentSync'
import { useFlowCanvasStore } from '../poc/store/flowCanvasStore'

interface CreateGitHubIssueModalProps {
  open: boolean
  onClose: () => void
  taskId?: string | null
}

export function CreateGitHubIssueModal({
  open,
  onClose,
  taskId,
}: CreateGitHubIssueModalProps) {
  const nodes = useFlowCanvasStore((s) => s.nodes)
  const taskNode = useMemo(
    () => (taskId ? nodes.find((n) => n.id === taskId) : null),
    [nodes, taskId]
  )

  // Find parent project frame if task is inside one
  const parentProject = useMemo(() => {
    if (!taskNode || !taskNode.parentId) return null
    return nodes.find((n) => n.id === taskNode.parentId && n.type === 'projectFrame')
  }, [nodes, taskNode])

  const defaultRepo = useMemo(() => {
    if (taskNode && (taskNode.data as any)?.githubRepo) {
      return (taskNode.data as any).githubRepo
    }
    if (parentProject && (parentProject.data as any)?.connectors?.githubRepo) {
      return (parentProject.data as any).connectors.githubRepo
    }
    return ''
  }, [taskNode, parentProject])

  const [repoInput, setRepoInput] = useState('')
  const [titleInput, setTitleInput] = useState('')
  const [bodyInput, setBodyInput] = useState('')
  const [labelsInput, setLabelsInput] = useState('')
  const [assigneesInput, setAssigneesInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<{ number: number; url: string } | null>(null)

  // Populate drafts when modal opens or task changes
  useEffect(() => {
    if (open && taskNode) {
      const data = taskNode.data as any
      setRepoInput(defaultRepo)
      setTitleInput(data.title || '')
      setBodyInput(data.notes || '')
      setLabelsInput(
        Array.isArray(data.githubLabels)
          ? data.githubLabels.join(', ')
          : data.priority === 1
          ? 'urgent, bug'
          : data.priority === 2
          ? 'enhancement'
          : 'task'
      )
      setAssigneesInput(data.githubAssignee || '')
      setErrorMsg(null)
      setSuccessResult(null)
    }
  }, [open, taskNode, defaultRepo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskId || !taskNode) return

    const normalizedRepo = normalizeGithubRepoInput(repoInput)
    if (!normalizedRepo || !normalizedRepo.includes('/')) {
      setErrorMsg('Please specify a valid GitHub repository (e.g. owner/repo).')
      return
    }

    if (!titleInput.trim()) {
      setErrorMsg('Issue title cannot be empty.')
      return
    }

    setIsSubmitting(true)
    setErrorMsg(null)

    try {
      const labels = labelsInput
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
      const assignees = assigneesInput
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)

      const result = await createGitHubIssue(normalizedRepo, {
        title: titleInput.trim(),
        body: bodyInput.trim(),
        labels: labels.length > 0 ? labels : undefined,
        assignees: assignees.length > 0 ? assignees : undefined,
      })

      // Update local canvas task card with newly created issue metadata
      const store = useFlowCanvasStore.getState()
      const formattedTitle = titleInput.startsWith('#')
        ? titleInput
        : `#${result.number} ${titleInput.trim()}`

      store.updateNodeData(taskId, {
        title: formattedTitle,
        githubIssueNumber: result.number,
        githubRepo: normalizedRepo,
        githubIssueUrl: result.html_url,
        githubAssignee: assignees[0] || null,
        githubLabels: labels,
        githubSyncStatus: 'synced',
      })

      setSuccessResult({ number: result.number, url: result.html_url })
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create GitHub issue.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!open || !taskNode) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-xl flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <GitPullRequest className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Create GitHub Issue</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Promote canvas task to an official repository issue
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successResult && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <Check className="size-4 shrink-0 text-emerald-500" />
              <span>
                Successfully created GitHub issue <strong>#{successResult.number}</strong>! Linking to card...
              </span>
            </div>
          )}

          {/* Repository Selection */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Target Repository
            </label>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo (e.g. yhauxell/foqz)"
              required
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 font-mono outline-none focus:ring-2 focus:ring-purple-500/40"
            />
          </div>

          {/* Issue Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Issue Title
            </label>
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Task title..."
              required
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500"
            />
          </div>

          {/* Issue Body / Markdown */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <span>Issue Description & Checklist (Markdown)</span>
              <span className="text-[10px] text-zinc-400 font-normal">Pre-filled from task notes</span>
            </div>
            <textarea
              value={bodyInput}
              onChange={(e) => setBodyInput(e.target.value)}
              rows={5}
              placeholder="Detailed issue description, acceptance criteria, or checklist..."
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500 resize-none font-mono"
            />
          </div>

          {/* Labels & Assignees Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Labels (comma-separated)
              </label>
              <input
                type="text"
                value={labelsInput}
                onChange={(e) => setLabelsInput(e.target.value)}
                placeholder="bug, enhancement, P1"
                className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Assignees (usernames)
              </label>
              <input
                type="text"
                value={assigneesInput}
                onChange={(e) => setAssigneesInput(e.target.value)}
                placeholder="octocat, devname"
                className="w-full px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Send className={`size-3.5 ${isSubmitting ? 'animate-pulse' : ''}`} />
              <span>{isSubmitting ? 'Creating Issue...' : 'Create GitHub Issue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
