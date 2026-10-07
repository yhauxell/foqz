import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  GitPullRequest,
  Search,
  RefreshCw,
  X,
  Check,
  Download,
  AlertCircle,
  ExternalLink,
  Tag,
  User,
  Filter,
} from 'lucide-react'
import {
  listRepositoryIssues,
  mapLabelsToPriority,
  getGithubToken,
  type GitHubIssue,
} from '../lib/githubSync'
import { normalizeGithubRepoInput } from '../lib/githubAgentSync'
import { useFlowCanvasStore } from '../poc/store/flowCanvasStore'

interface GitHubIssuesModalProps {
  open: boolean
  onClose: () => void
  projectId?: string | null
  githubRepo?: string
}

export function GitHubIssuesModal({
  open,
  onClose,
  projectId,
  githubRepo: initialRepo = '',
}: GitHubIssuesModalProps) {
  const [repoInput, setRepoInput] = useState(initialRepo)
  const [searchQuery, setSearchQuery] = useState('')
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [selectedLabel, setSelectedLabel] = useState<string>('all')
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectedIssueNumbers, setSelectedIssueNumbers] = useState<Set<number>>(new Set())
  const [importedStatus, setImportedStatus] = useState<Record<number, boolean>>({})
  const [showTokenPrompt, setShowTokenPrompt] = useState(false)
  const [quickToken, setQuickToken] = useState('')
  const [tokenSaved, setTokenSaved] = useState(false)

  const nodes = useFlowCanvasStore((s) => s.nodes)
  const projectNode = useMemo(
    () => (projectId ? nodes.find((n) => n.id === projectId) : null),
    [nodes, projectId]
  )

  // Determine effective repository string
  const activeRepo = useMemo(() => {
    if (repoInput.trim()) return normalizeGithubRepoInput(repoInput)
    if (projectNode && (projectNode.data as any)?.connectors?.githubRepo) {
      return normalizeGithubRepoInput((projectNode.data as any).connectors.githubRepo)
    }
    return ''
  }, [repoInput, projectNode])

  // Update input if initialRepo or projectNode changes
  useEffect(() => {
    if (initialRepo) {
      setRepoInput(initialRepo)
    } else if (projectNode && (projectNode.data as any)?.connectors?.githubRepo) {
      setRepoInput((projectNode.data as any).connectors.githubRepo)
    }
  }, [initialRepo, projectNode])

  // Identify issues that are already imported into the canvas board
  const importedNumbers = useMemo(() => {
    const set = new Set<number>()
    nodes.forEach((n) => {
      if (n.type === 'focusTask' && (n.data as any)?.githubIssueNumber) {
        set.add(Number((n.data as any).githubIssueNumber))
      }
    })
    return set
  }, [nodes])

  // Fetch issues
  const fetchIssues = useCallback(async () => {
    if (!activeRepo || !activeRepo.includes('/')) {
      setErrorMsg('Please specify a valid GitHub repository (e.g. owner/repo).')
      setIssues([])
      return
    }

    setIsLoading(true)
    setErrorMsg(null)

    try {
      const data = await listRepositoryIssues(activeRepo, {
        state: stateFilter,
        search: searchQuery,
      })
      setIssues(data)
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch issues from GitHub.')
      setIssues([])
    } finally {
      setIsLoading(false)
    }
  }, [activeRepo, stateFilter, searchQuery])

  useEffect(() => {
    if (open && activeRepo) {
      fetchIssues()
    }
  }, [open, activeRepo, fetchIssues])

  // Collect all unique labels for filter dropdown
  const allAvailableLabels = useMemo(() => {
    const labelsMap = new Map<string, string>()
    issues.forEach((i) => {
      i.labels.forEach((l) => {
        if (l.name) labelsMap.set(l.name.toLowerCase(), l.name)
      })
    })
    return Array.from(labelsMap.values()).sort()
  }, [issues])

  // Filtered issues list
  const filteredIssues = useMemo(() => {
    return issues.filter((i) => {
      if (selectedLabel !== 'all') {
        const hasLabel = i.labels.some((l) => l.name.toLowerCase() === selectedLabel.toLowerCase())
        if (!hasLabel) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = i.title.toLowerCase().includes(q)
        const matchBody = i.body && i.body.toLowerCase().includes(q)
        const matchNum = `#${i.number}`.includes(q)
        if (!matchTitle && !matchBody && !matchNum) return false
      }
      return true
    })
  }, [issues, selectedLabel, searchQuery])

  // Toggle selection
  const toggleIssueSelection = (num: number) => {
    setSelectedIssueNumbers((prev) => {
      const next = new Set(prev)
      if (next.has(num)) next.delete(num)
      else next.add(num)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIssueNumbers.size === filteredIssues.length) {
      setSelectedIssueNumbers(new Set())
    } else {
      setSelectedIssueNumbers(new Set(filteredIssues.map((i) => i.number)))
    }
  }

  // Batch or Single Import Action
  const handleImportIssues = (issuesToImport: GitHubIssue[]) => {
    if (issuesToImport.length === 0) return

    const store = useFlowCanvasStore.getState()
    const targetParentId = projectId || undefined

    // Calculate layout positions if importing into a project frame
    const existingCount = nodes.filter((n) => n.parentId === targetParentId).length

    issuesToImport.forEach((issue, idx) => {
      const priority = mapLabelsToPriority(issue.labels)
      const formattedTitle = `#${issue.number} ${issue.title}`

      let notes = issue.body || ''
      notes = `${notes.trim()}\n\n---\n🔗 [View on GitHub](${issue.html_url})`

      const taskX = targetParentId ? 32 + (idx % 2) * 290 : 300 + Math.random() * 50
      const taskY = targetParentId ? 100 + Math.floor((existingCount + idx) / 2) * 110 : 250 + Math.random() * 50

      const taskId = store.createTask({
        title: formattedTitle,
        priority,
        status: issue.state === 'closed' ? 'done' : 'open',
        notes,
        parentId: targetParentId,
        position: { x: taskX, y: taskY },
      })

      // Update node data with rich GitHub metadata
      store.updateNodeData(taskId, {
        githubIssueNumber: issue.number,
        githubRepo: activeRepo,
        githubIssueUrl: issue.html_url,
        githubAssignee: issue.assignee?.login || null,
        githubLabels: issue.labels.map((l) => l.name),
        githubSyncStatus: 'synced',
      })

      setImportedStatus((prev) => ({ ...prev, [issue.number]: true }))
    })

    setSelectedIssueNumbers(new Set())
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden text-zinc-900 dark:text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <GitPullRequest className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">GitHub Issues Browser</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {projectNode
                  ? `Import issues into "${(projectNode.data as any)?.title || 'Project'}"`
                  : 'Import repository issues as spatial Focus Task cards'}
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

        {/* Filters Toolbar */}
        <div className="px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3">
          {/* Repo Input & Search Bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-mono font-bold">
                repo:
              </span>
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchIssues()}
                placeholder="owner/repository (e.g. yhauxell/foqz)"
                className="w-full pl-14 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-900 dark:text-zinc-100 font-mono outline-none focus:ring-2 focus:ring-purple-500/40"
              />
            </div>

            <button
              type="button"
              onClick={fetchIssues}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Fetch Issues</span>
            </button>
          </div>

          {/* Search Query & State Pills */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search issues by title, body, or #number..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500"
              />
            </div>

            {/* State Filter Buttons */}
            <div className="flex items-center p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs">
              {(['open', 'closed', 'all'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStateFilter(st)}
                  className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-colors cursor-pointer ${
                    stateFilter === st
                      ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Label Filter Dropdown */}
            {allAvailableLabels.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="size-3.5 text-zinc-400" />
                <select
                  value={selectedLabel}
                  onChange={(e) => setSelectedLabel(e.target.value)}
                  className="py-1 px-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-800 dark:text-zinc-200 outline-none"
                >
                  <option value="all">All Labels</option>
                  {allAvailableLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Error Alert with Quick PAT Configuration */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span className="font-medium">{errorMsg}</span>
              </div>
              {!showTokenPrompt && (
                <button
                  type="button"
                  onClick={() => setShowTokenPrompt(true)}
                  className="text-[11px] underline font-semibold text-purple-600 dark:text-purple-400 hover:opacity-80 shrink-0 cursor-pointer"
                >
                  Configure PAT →
                </button>
              )}
            </div>

            {showTokenPrompt && (
              <div className="pt-2 border-t border-rose-500/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="password"
                  placeholder="Paste GitHub Personal Access Token (ghp_...)"
                  value={quickToken}
                  onChange={(e) => setQuickToken(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900 bg-white dark:bg-zinc-900 text-xs font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const token = quickToken.trim()
                    if (token) {
                      localStorage.setItem('foqz_github_token', token)
                      setTokenSaved(true)
                      setErrorMsg(null)
                      setShowTokenPrompt(false)
                      fetchIssues()
                    }
                  }}
                  disabled={!quickToken.trim()}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shrink-0 transition-colors"
                >
                  Save & Retry
                </button>
              </div>
            )}
          </div>
        )}

        {tokenSaved && !errorMsg && (
          <div className="mx-6 mt-3 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
            <Check className="size-3.5" />
            <span>GitHub Personal Access Token saved!</span>
          </div>
        )}

        {/* Issues List Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 min-h-[250px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 space-y-2">
              <RefreshCw className="size-6 animate-spin text-purple-500" />
              <p className="text-xs">Fetching repository issues from GitHub...</p>
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-400 space-y-2">
              <GitPullRequest className="size-8 stroke-[1.5] text-zinc-300 dark:text-zinc-700" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No issues found</p>
              <p className="text-xs max-w-sm">
                {activeRepo
                  ? 'No matching GitHub issues were found for this repository and search filter.'
                  : 'Specify a GitHub repository (e.g. owner/repo) above to list and import issues.'}
              </p>
            </div>
          ) : (
            filteredIssues.map((issue) => {
              const isSelected = selectedIssueNumbers.has(issue.number)
              const isAlreadyImported = importedNumbers.has(issue.number) || importedStatus[issue.number]
              const priorityNum = mapLabelsToPriority(issue.labels)

              return (
                <div
                  key={issue.number}
                  className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-purple-500/60 bg-purple-500/5'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleIssueSelection(issue.number)}
                      className="mt-0.5 size-4 rounded text-purple-600 border-zinc-300 dark:border-zinc-700 focus:ring-purple-500 cursor-pointer"
                    />

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Number badge */}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          #{issue.number}
                        </span>

                        {/* Title */}
                        <a
                          href={issue.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold hover:text-purple-600 dark:hover:text-purple-400 hover:underline transition-colors flex items-center gap-1"
                        >
                          <span>{issue.title}</span>
                          <ExternalLink className="size-2.5 text-zinc-400 shrink-0" />
                        </a>

                        {/* State Pill */}
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold ${
                            issue.state === 'open'
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          }`}
                        >
                          {issue.state}
                        </span>

                        {/* Priority Pill */}
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-black/5 dark:bg-white/10 text-zinc-500">
                          P{priorityNum}
                        </span>

                        {/* Already imported indicator */}
                        {isAlreadyImported && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            <Check className="size-2.5" />
                            <span>On Board</span>
                          </span>
                        )}
                      </div>

                      {/* Labels */}
                      {issue.labels.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                          <Tag className="size-2.5 text-zinc-400 shrink-0" />
                          {issue.labels.map((lbl) => (
                            <span
                              key={lbl.name}
                              className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/80"
                            >
                              {lbl.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Single Import Button */}
                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {issue.assignee && (
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                        <User className="size-2.5" />
                        <span>{issue.assignee.login}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleImportIssues([issue])}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-purple-600 hover:text-white dark:hover:bg-purple-600 transition-colors text-xs font-medium cursor-pointer border border-zinc-200 dark:border-zinc-700"
                    >
                      <Download className="size-3" />
                      <span>{isAlreadyImported ? 'Import Again' : 'Import'}</span>
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={filteredIssues.length === 0}
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 disabled:opacity-40 cursor-pointer"
            >
              {selectedIssueNumbers.size === filteredIssues.length && filteredIssues.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
            <span className="text-xs text-zinc-400 font-mono">
              ({selectedIssueNumbers.size} selected)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Done
            </button>

            <button
              type="button"
              onClick={() => {
                const selectedList = issues.filter((i) => selectedIssueNumbers.has(i.number))
                handleImportIssues(selectedList)
              }}
              disabled={selectedIssueNumbers.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>Import Selected ({selectedIssueNumbers.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
