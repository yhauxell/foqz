import { MANAGED_PRIORITY_LABELS, PRIORITY_LABELS, mapLabelsToPriority } from './githubLabels'

/**
 * Pure three-way merge between a canvas task, the GitHub issue it is linked to, and the
 * last-synced snapshot of that issue. No I/O: the sync engine executes the returned plan.
 *
 * A field counts as changed locally when it differs from the snapshot, and as changed remotely
 * when GitHub differs from the snapshot. One-sided changes flow to the other side; changes on
 * both sides that disagree become conflicts and are left untouched until resolved.
 */

export type IssueState = 'open' | 'closed'
export type TaskPriority = 1 | 2 | 3 | 4
export type SyncField = 'state' | 'priority' | 'assignee'

export interface LocalTaskFields {
  state: IssueState
  priority: TaskPriority
  assignee: string | null
}

export interface RemoteIssueFields {
  state: IssueState
  labels: string[]
  assignee: string | null
}

export interface SyncSnapshot extends RemoteIssueFields {
  /** Priority the task had when labels were last reconciled (labels alone can't express P3 + "bug"). */
  priority: TaskPriority
  /** Epoch ms of the last successful reconcile. */
  syncedAt: number
}

export interface ReconcilePlan {
  push: {
    state?: IssueState
    addLabels: string[]
    removeLabels: string[]
    assignee?: { from: string | null; to: string | null }
  }
  /** Values to write onto the canvas task. `labels` is display-only metadata. */
  pull: Partial<{ state: IssueState; priority: TaskPriority; assignee: string | null; labels: string[] }>
  conflicts: SyncField[]
  /** Snapshot to persist once every push in the plan has succeeded. */
  nextSnapshot: SyncSnapshot
}

const lower = (s: string) => s.toLowerCase()

export function sameLabelSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a.map(lower))
  return b.every((l) => set.has(lower(l)))
}

/** Label changes that make `labels` express `priority`, touching only Foqz-managed labels. */
export function priorityLabelOps(labels: string[], priority: TaskPriority) {
  const target = priority === 3 ? null : PRIORITY_LABELS[priority]
  const managed = new Set(MANAGED_PRIORITY_LABELS.map(lower))
  const removeLabels = labels.filter((l) => managed.has(lower(l)) && (!target || lower(l) !== lower(target)))
  const kept = labels.filter((l) => !removeLabels.includes(l))
  const addLabels = target && !kept.some((l) => lower(l) === lower(target)) ? [target] : []
  return { addLabels, removeLabels, resulting: [...kept, ...addLabels] }
}

export function snapshotFromLocal(local: LocalTaskFields, labels: string[], now: number): SyncSnapshot {
  return { state: local.state, labels: [...labels], assignee: local.assignee, priority: local.priority, syncedAt: now }
}

export function reconcile(
  local: LocalTaskFields,
  snapshot: SyncSnapshot,
  remote: RemoteIssueFields,
  now: number,
): ReconcilePlan {
  const plan: ReconcilePlan = {
    push: { addLabels: [], removeLabels: [] },
    pull: {},
    conflicts: [],
    nextSnapshot: { ...snapshot, labels: [...snapshot.labels], syncedAt: now },
  }
  const next = plan.nextSnapshot

  // --- State (open / closed) ---
  const localState = local.state !== snapshot.state
  const remoteState = remote.state !== snapshot.state
  if (localState && remoteState && local.state !== remote.state) {
    plan.conflicts.push('state')
  } else if (localState && !remoteState) {
    plan.push.state = local.state
    next.state = local.state
  } else {
    if (remoteState && !localState) plan.pull.state = remote.state
    next.state = remote.state
  }

  // --- Priority <-> labels ---
  const localPriority = local.priority !== snapshot.priority
  const remoteLabels = !sameLabelSet(remote.labels, snapshot.labels)
  const remotePriority = mapLabelsToPriority(remote.labels)
  if (remoteLabels) plan.pull.labels = [...remote.labels]

  if (localPriority && remoteLabels && remotePriority !== local.priority) {
    plan.conflicts.push('priority')
  } else if (localPriority && remotePriority !== local.priority) {
    const ops = priorityLabelOps(remote.labels, local.priority)
    plan.push.addLabels = ops.addLabels
    plan.push.removeLabels = ops.removeLabels
    if (ops.addLabels.length || ops.removeLabels.length) plan.pull.labels = ops.resulting
    next.labels = ops.resulting
    next.priority = local.priority
  } else {
    // Only re-derive priority when the labels actually changed; otherwise a label set that can't
    // express the local priority (e.g. "bug" on a P3 task) would keep overwriting it.
    if (remoteLabels && remotePriority !== local.priority) plan.pull.priority = remotePriority
    next.labels = [...remote.labels]
    next.priority = localPriority || remoteLabels ? remotePriority : snapshot.priority
  }

  // --- Primary assignee ---
  const localAssignee = local.assignee !== snapshot.assignee
  const remoteAssignee = remote.assignee !== snapshot.assignee
  if (localAssignee && remoteAssignee && local.assignee !== remote.assignee) {
    plan.conflicts.push('assignee')
  } else if (localAssignee && !remoteAssignee) {
    plan.push.assignee = { from: remote.assignee, to: local.assignee }
    next.assignee = local.assignee
  } else {
    if (remoteAssignee && !localAssignee) plan.pull.assignee = remote.assignee
    next.assignee = remote.assignee
  }

  return plan
}

export function isLocallyDirty(local: LocalTaskFields, snapshot: SyncSnapshot): boolean {
  return (
    local.state !== snapshot.state ||
    local.priority !== snapshot.priority ||
    local.assignee !== snapshot.assignee
  )
}
