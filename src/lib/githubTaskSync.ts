import { useEffect } from 'react'
import { create } from 'zustand'
import type { Node } from '@xyflow/react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import { normalizeGithubRepoInput } from './githubRepo'
import { isActionable } from './nodePredicates'
import {
  isLocallyDirty,
  reconcile,
  SNAPSHOT_VERSION,
  snapshotFromLocal,
  type IssueState,
  type LocalTaskFields,
  type ReconcilePlan,
  type RemoteIssueFields,
  type SyncField,
  type SyncSnapshot,
} from './githubReconcile'
import {
  addIssueLabels,
  changeIssueAssignees,
  getGithubToken,
  getIssue,
  listIssuesUpdatedSince,
  removeIssueLabel,
  updateGitHubIssue,
  type GitHubIssue,
} from './githubSync'

/**
 * Two-way sync between actionable canvas items and their linked GitHub issues: open/closed, primary
 * assignee, and labels. Whether marking an item done closes the issue (and reopening reopens it) is
 * a setting: automatically, ask first, or never.
 *
 * Last-synced snapshots (one per card) live in localStorage, outside the undoable canvas store, so
 * undoing a task change makes it differ from the snapshot again and the undo is pushed to GitHub
 * instead of being reverted by the next pull.
 */

const SNAPSHOTS_KEY = 'foqz_github_sync_snapshots'
const INTERVAL_KEY = 'foqz_github_sync_interval_min'
const INTERVAL_EVENT = 'foqz:github-sync-interval-changed'
const STATE_PUSH_KEY = 'foqz_github_sync_state_push'
const DEFAULT_INTERVAL_MIN = 10
const PUSH_DEBOUNCE_MS = 1500
/** Overlap for `since` polling so clock skew between this machine and GitHub can't drop updates. */
const POLL_OVERLAP_MS = 2 * 60 * 1000

export type TaskSyncStatus = 'syncing' | 'synced' | 'error' | 'conflict' | 'confirm'

export interface TaskSyncRuntime {
  status: TaskSyncStatus
  error?: string
  conflict?: { fields: SyncField[]; remote: RemoteIssueFields }
  /** With close/reopen set to Ask first: the issue state waiting for the user's go-ahead. */
  pendingState?: IssueState
}

/** Per-task sync status. Runtime-only: conflicts are re-detected from the persisted snapshots. */
export const useGitHubSyncStatus = create<{ byNode: Record<string, TaskSyncRuntime> }>(() => ({ byNode: {} }))

function setRuntime(nodeId: string, runtime: TaskSyncRuntime) {
  useGitHubSyncStatus.setState((s) => ({ byNode: { ...s.byNode, [nodeId]: runtime } }))
}

// --- Settings -----------------------------------------------------------------------------------

export function getSyncIntervalMinutes(): number {
  try {
    const raw = localStorage.getItem(INTERVAL_KEY)
    if (raw !== null && Number.isFinite(Number(raw))) return Math.max(0, Number(raw))
  } catch {}
  return DEFAULT_INTERVAL_MIN
}

export function setSyncIntervalMinutes(minutes: number) {
  try {
    localStorage.setItem(INTERVAL_KEY, String(minutes))
  } catch {}
  window.dispatchEvent(new CustomEvent(INTERVAL_EVENT))
}

/** What happens on GitHub when a linked item is marked done or reopened on the canvas. */
export type StatePushMode = 'auto' | 'ask' | 'off'

export function getStatePushMode(): StatePushMode {
  try {
    const raw = localStorage.getItem(STATE_PUSH_KEY)
    if (raw === 'ask' || raw === 'off') return raw
  } catch {}
  return 'auto'
}

export function setStatePushMode(mode: StatePushMode) {
  try {
    localStorage.setItem(STATE_PUSH_KEY, mode)
  } catch {}
}

// --- Snapshots ----------------------------------------------------------------------------------

let snapshotCache: Record<string, SyncSnapshot> | null = null

function snapshots(): Record<string, SyncSnapshot> {
  if (!snapshotCache) {
    try {
      snapshotCache = JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '{}') || {}
    } catch {
      snapshotCache = {}
    }
  }
  return snapshotCache!
}

function saveSnapshot(key: string, snapshot: SyncSnapshot) {
  snapshots()[key] = snapshot
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshotCache))
  } catch {}
}

// --- Canvas task helpers ------------------------------------------------------------------------

interface LinkedTask {
  nodeId: string
  repo: string
  issueNumber: number
  key: string
  local: LocalTaskFields
  status: string
}

function toLinkedTask(node: Node): LinkedTask | null {
  if (!isActionable(node)) return null
  const d = (node.data || {}) as Record<string, any>
  const issueNumber = Number(d.githubIssueNumber)
  const repo = d.githubRepo ? normalizeGithubRepoInput(String(d.githubRepo)) : ''
  if (!issueNumber || !repo.includes('/')) return null
  return {
    nodeId: node.id,
    repo,
    issueNumber,
    // Per card, not per issue: duplicated cards share an issue, and a shared snapshot would make
    // them push opposite values back and forth. Per card, one card's push is a remote change the
    // other simply pulls.
    key: `${useFlowCanvasStore.getState().activeBoardId}:${node.id}`,
    local: {
      state: d.status === 'done' ? 'closed' : 'open',
      assignee: d.githubAssignee ? String(d.githubAssignee) : null,
      labels: Array.isArray(d.githubLabels) ? d.githubLabels.map(String) : [],
    },
    status: String(d.status || 'open'),
  }
}

function findLinkedTask(nodeId: string): LinkedTask | null {
  const node = useFlowCanvasStore.getState().nodes.find((n) => n.id === nodeId)
  return node ? toLinkedTask(node) : null
}

function snapshotFor(task: LinkedTask): SyncSnapshot {
  const existing = snapshots()[task.key]
  if (existing?.v === SNAPSHOT_VERSION) return existing
  if (existing) {
    // Written before labels were pushed, when card labels were display-only. Re-baseline them on
    // the card's labels so a stale difference is never pushed to GitHub as a removal.
    const upgraded = { ...existing, labels: [...task.local.labels], v: SNAPSHOT_VERSION }
    saveSnapshot(task.key, upgraded)
    return upgraded
  }
  // First sight of a linked task: it was just imported/created in sync with GitHub.
  const initial = snapshotFromLocal(task.local, 0)
  saveSnapshot(task.key, initial)
  return initial
}

/**
 * Write values that came from GitHub onto a task. They are facts about the issue, not user edits,
 * so they are also applied to every undo/redo entry: undoing an unrelated edit must not restore a
 * stale assignee or status that the engine would then push back to GitHub.
 */
function writeTask(nodeId: string, patch: Record<string, any>) {
  if (Object.keys(patch).length === 0) return
  const temporal = useFlowCanvasStore.temporal
  const wasTracking = temporal.getState().isTracking
  if (wasTracking) temporal.getState().pause()
  try {
    useFlowCanvasStore.getState().updateNodeData(nodeId, patch)
  } finally {
    if (wasTracking) temporal.getState().resume()
  }

  type HistoryEntry = { nodes?: Node[] }
  const applyToEntry = (entry: HistoryEntry): HistoryEntry =>
    entry.nodes?.some((n) => n.id === nodeId)
      ? {
          ...entry,
          nodes: entry.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
        }
      : entry
  const { pastStates, futureStates } = temporal.getState()
  temporal.setState({
    pastStates: (pastStates as HistoryEntry[]).map(applyToEntry),
    futureStates: (futureStates as HistoryEntry[]).map(applyToEntry),
  } as any)
}

function pullPatch(pull: ReconcilePlan['pull'], currentStatus: string): Record<string, any> {
  const patch: Record<string, any> = {}
  if (pull.state === 'closed') patch.status = 'done'
  // Reopening on GitHub moves a done item back to open.
  if (pull.state === 'open' && currentStatus === 'done') patch.status = 'open'
  if (pull.assignee !== undefined) patch.githubAssignee = pull.assignee
  if (pull.labels !== undefined) patch.githubLabels = pull.labels
  return patch
}

/**
 * The task tracks one assignee. If it is still among the issue's assignees it is the remote value;
 * otherwise GitHub's primary assignee is (so co-assignees never look like a reassignment).
 */
function remoteFields(issue: GitHubIssue, trackedAssignee: string | null): RemoteIssueFields {
  const logins = (issue.assignees?.length ? issue.assignees : issue.assignee ? [issue.assignee] : []).map(
    (a) => a.login,
  )
  const tracked = trackedAssignee && logins.find((l) => l.toLowerCase() === trackedAssignee.toLowerCase())
  return {
    state: issue.state,
    labels: issue.labels.map((l) => l.name),
    assignee: tracked || logins[0] || null,
  }
}

// --- Reconcile one task -------------------------------------------------------------------------

const inFlight = new Set<string>()
const queued = new Set<string>()
/** Tasks whose pending close/reopen the user just approved (Ask first). */
const approvedStatePush = new Set<string>()

/**
 * Fetch (or use the provided) remote issue, merge it with the task, push local changes, pull
 * remote ones, and flag conflicts.
 */
export async function syncTask(nodeId: string, remoteIssue?: GitHubIssue): Promise<void> {
  if (inFlight.has(nodeId)) {
    queued.add(nodeId)
    return
  }
  const task = findLinkedTask(nodeId)
  if (!task) return

  inFlight.add(nodeId)
  setRuntime(nodeId, { status: 'syncing' })
  try {
    const issue = remoteIssue ?? (await getIssue(task.repo, task.issueNumber))
    // Re-read: the task may have changed while the issue was loading.
    const fresh = findLinkedTask(nodeId)
    if (!fresh) return
    const snapshot = snapshotFor(fresh)
    const remote = remoteFields(issue, snapshot.assignee)
    const plan = reconcile(fresh.local, snapshot, remote, Date.now())
    const pendingState = holdStatePush(nodeId, plan, snapshot)
    const hasPush =
      plan.push.state !== undefined || plan.push.assignee !== undefined || plan.push.labels !== undefined
    if (hasPush && !getGithubToken(fresh.repo)) {
      throw new Error('GitHub token missing. Add it in Settings → Integrations to push changes.')
    }

    const pushError = await executePush(fresh, plan)
    saveSnapshot(fresh.key, plan.nextSnapshot)
    writeTask(nodeId, pullPatch(plan.pull, fresh.status))

    if (plan.conflicts.length > 0) {
      setRuntime(nodeId, { status: 'conflict', conflict: { fields: plan.conflicts, remote } })
    } else if (pendingState) {
      setRuntime(nodeId, { status: 'confirm', pendingState, error: pushError ?? undefined })
    } else if (pushError) {
      setRuntime(nodeId, { status: 'error', error: pushError })
    } else {
      setRuntime(nodeId, { status: 'synced' })
    }
  } catch (err) {
    setRuntime(nodeId, { status: 'error', error: err instanceof Error ? err.message : String(err) })
  } finally {
    inFlight.delete(nodeId)
    if (queued.delete(nodeId)) void syncTask(nodeId)
  }
}

/**
 * Unless close/reopen is automatic (or the user just approved it), take the state push out of the
 * plan. With Off it is recorded as declined; with Ask first it is returned so the card can ask.
 */
function holdStatePush(nodeId: string, plan: ReconcilePlan, snapshot: SyncSnapshot): IssueState | null {
  const approved = approvedStatePush.delete(nodeId)
  const state = plan.push.state
  if (!state || approved) return null
  const mode = getStatePushMode()
  if (mode === 'auto') return null
  delete plan.push.state
  // GitHub didn't change (or this would be a pull or a conflict), so it keeps the snapshot state.
  plan.nextSnapshot.state = snapshot.state
  if (mode === 'off') {
    plan.nextSnapshot.declinedState = state
    return null
  }
  return state
}

/**
 * Apply the plan's pushes. Rejected changes (GitHub ignored an assignee, refused a state change)
 * are reverted on the canvas and reported, so the task doesn't stay dirty and retry forever.
 * Returns a user-facing error message, if any.
 */
async function executePush(task: LinkedTask, plan: ReconcilePlan): Promise<string | null> {
  const { push, nextSnapshot, pull } = plan
  const { repo, issueNumber } = task

  if (push.state) {
    const updated = await updateGitHubIssue(repo, issueNumber, { state: push.state })
    if (updated.state !== push.state) {
      nextSnapshot.state = updated.state
      pull.state = updated.state as IssueState
      return `GitHub kept #${issueNumber} ${updated.state}.`
    }
  }

  if (push.assignee) {
    const { from, to } = push.assignee
    if (to) {
      const issue = await changeIssueAssignees(repo, issueNumber, 'POST', [to])
      if (!(issue.assignees || []).some((a) => a.login.toLowerCase() === to.toLowerCase())) {
        // GitHub silently drops assignees without access to the repository.
        nextSnapshot.assignee = from
        pull.assignee = from
        return `GitHub did not accept @${to} as an assignee. They may not have access to ${repo}.`
      }
    }
    if (from && from.toLowerCase() !== (to || '').toLowerCase()) {
      await changeIssueAssignees(repo, issueNumber, 'DELETE', [from])
    }
    nextSnapshot.assignee = to
  }

  if (push.labels) {
    let labels: string[] | null = null
    for (const name of push.labels.remove) {
      // null: already removed on GitHub, which is what we wanted.
      labels = (await removeIssueLabel(repo, issueNumber, name)) ?? labels
    }
    if (push.labels.add.length > 0) labels = await addIssueLabels(repo, issueNumber, push.labels.add)
    if (labels) {
      nextSnapshot.labels = labels
      pull.labels = labels
    }
  }
  return null
}

// --- Conflict resolution ------------------------------------------------------------------------

/** Resolve a sync conflict by keeping the canvas values (`mine`) or taking GitHub's (`github`). */
export async function resolveSyncConflict(nodeId: string, choice: 'mine' | 'github') {
  const runtime = useGitHubSyncStatus.getState().byNode[nodeId]
  const task = findLinkedTask(nodeId)
  if (!runtime?.conflict || !task) return
  const { fields, remote } = runtime.conflict
  const snapshot = { ...snapshotFor(task) }
  const patch: Record<string, any> = {}

  // Treat GitHub's conflicting values as already seen; with `mine`, the next sync pushes the
  // canvas values over them, with `github` the canvas adopts them.
  if (fields.includes('state')) {
    snapshot.state = remote.state
    if (choice === 'github') Object.assign(patch, pullPatch({ state: remote.state }, task.status))
  }
  if (fields.includes('assignee')) {
    snapshot.assignee = remote.assignee
    if (choice === 'github') patch.githubAssignee = remote.assignee
  }
  saveSnapshot(task.key, snapshot)
  writeTask(nodeId, patch)
  await syncTask(nodeId)
}

// --- Close/reopen confirmation (Ask first) -----------------------------------------------------

/** Push the pending close/reopen to GitHub. */
export async function approveStatePush(nodeId: string) {
  approvedStatePush.add(nodeId)
  await syncTask(nodeId)
}

/** Keep the change on the canvas only; it is not pushed or asked about again. */
export function declineStatePush(nodeId: string) {
  const task = findLinkedTask(nodeId)
  if (!task) return
  saveSnapshot(task.key, { ...snapshotFor(task), declinedState: task.local.state })
  setRuntime(nodeId, { status: 'synced' })
}

// --- Bulk sync ----------------------------------------------------------------------------------

function linkedTasks(): LinkedTask[] {
  return useFlowCanvasStore
    .getState()
    .nodes.map(toLinkedTask)
    .filter((t): t is LinkedTask => t !== null)
}

/** Manually sync every task on the current board linked to `repoInput`. */
export async function syncRepoTasks(repoInput: string): Promise<void> {
  const repo = normalizeGithubRepoInput(repoInput).toLowerCase()
  const tasks = linkedTasks().filter((t) => t.repo.toLowerCase() === repo)
  for (const t of tasks) await syncTask(t.nodeId)
}

/**
 * Poll every repository linked on the current board with one paginated request each, reconciling
 * tasks whose issues changed. Tasks with unpushed local changes are re-synced too.
 */
export async function pollLinkedRepos(): Promise<void> {
  const byRepo = new Map<string, LinkedTask[]>()
  for (const t of linkedTasks()) {
    const key = t.repo.toLowerCase()
    byRepo.set(key, [...(byRepo.get(key) || []), t])
  }

  for (const tasks of byRepo.values()) {
    const repo = tasks[0].repo
    // Unauthenticated requests are limited to 60/hour; only poll repos with a token.
    if (!getGithubToken(repo)) continue
    const pollStartedAt = Date.now()
    const oldest = Math.min(...tasks.map((t) => snapshotFor(t).syncedAt))
    const since = oldest > 0 ? new Date(oldest - POLL_OVERLAP_MS).toISOString() : null
    let issues: GitHubIssue[]
    try {
      issues = await listIssuesUpdatedSince(repo, since)
    } catch (err) {
      console.warn('[githubTaskSync] poll failed for', repo, err)
      continue
    }
    const byNumber = new Map(issues.map((i) => [i.number, i]))
    for (const t of tasks) {
      const issue = byNumber.get(t.issueNumber)
      const snapshot = snapshotFor(t)
      if (issue) await syncTask(t.nodeId, issue)
      else if (isLocallyDirty(t.local, snapshot)) await syncTask(t.nodeId)
      // Unchanged on GitHub since the last poll: advance the cursor so `since` keeps moving.
      else saveSnapshot(t.key, { ...snapshot, syncedAt: pollStartedAt })
    }
  }
}

// --- Engine -------------------------------------------------------------------------------------

/**
 * Mount once at the app root: pushes local task edits (debounced) and polls GitHub on the
 * configured interval. Only the active board is in the store, so only its tasks are synced.
 */
export function useGitHubSyncEngine() {
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const lastDirtySignature = new Map<string, string>()

    const scan = (nodes: Node[]) => {
      for (const node of nodes) {
        const task = toLinkedTask(node)
        if (!task) continue
        const snapshot = snapshotFor(task)
        if (!isLocallyDirty(task.local, snapshot)) {
          lastDirtySignature.delete(task.nodeId)
          // Back in sync (e.g. undo): drop a stale prompt, and forget a declined state so marking
          // the task done again asks again.
          if (useGitHubSyncStatus.getState().byNode[task.nodeId]?.status === 'confirm') {
            setRuntime(task.nodeId, { status: 'synced' })
          }
          if (snapshot.declinedState && task.local.state === snapshot.state) {
            const { declinedState: _declined, ...rest } = snapshot
            saveSnapshot(task.key, rest)
          }
          continue
        }
        // Schedule once per distinct local edit; failed pushes wait for the next edit or poll.
        const labels = [...task.local.labels].map((l) => l.toLowerCase()).sort().join(',')
        const signature = `${task.local.state}|${task.local.assignee}|${labels}`
        if (lastDirtySignature.get(task.nodeId) === signature) continue
        lastDirtySignature.set(task.nodeId, signature)
        if (useGitHubSyncStatus.getState().byNode[task.nodeId]?.status === 'conflict') continue
        clearTimeout(timers.get(task.nodeId))
        timers.set(
          task.nodeId,
          setTimeout(() => {
            timers.delete(task.nodeId)
            void syncTask(task.nodeId)
          }, PUSH_DEBOUNCE_MS),
        )
      }
    }

    scan(useFlowCanvasStore.getState().nodes)
    const unsubscribe = useFlowCanvasStore.subscribe((state, prev) => {
      if (state.nodes !== prev.nodes) scan(state.nodes)
    })

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const schedulePolling = () => {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      const minutes = getSyncIntervalMinutes()
      if (minutes > 0) pollTimer = setInterval(() => void pollLinkedRepos(), minutes * 60 * 1000)
    }
    schedulePolling()
    window.addEventListener(INTERVAL_EVENT, schedulePolling)
    const initialPoll = setTimeout(() => {
      if (getSyncIntervalMinutes() > 0) void pollLinkedRepos()
    }, 5000)

    return () => {
      unsubscribe()
      timers.forEach(clearTimeout)
      if (pollTimer) clearInterval(pollTimer)
      clearTimeout(initialPoll)
      window.removeEventListener(INTERVAL_EVENT, schedulePolling)
    }
  }, [])
}
