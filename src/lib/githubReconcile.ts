/**
 * Pure three-way merge between a canvas item, the GitHub issue it is linked to, and the
 * last-synced snapshot of that issue. No I/O: the sync engine executes the returned plan.
 *
 * A field counts as changed locally when it differs from the snapshot, and as changed remotely
 * when GitHub differs from the snapshot. One-sided changes flow to the other side; changes on
 * both sides that disagree become conflicts and are left untouched until resolved.
 *
 * Synced fields: open/closed state and the primary assignee. Labels are pulled for display only.
 */

export type IssueState = 'open' | 'closed'
export type SyncField = 'state' | 'assignee'

export interface LocalTaskFields {
  state: IssueState
  assignee: string | null
}

export interface RemoteIssueFields {
  state: IssueState
  labels: string[]
  assignee: string | null
}

export interface SyncSnapshot extends RemoteIssueFields {
  /** Epoch ms of the last successful reconcile. */
  syncedAt: number
}

export interface ReconcilePlan {
  push: {
    state?: IssueState
    assignee?: { from: string | null; to: string | null }
  }
  /** Values to write onto the canvas item. `labels` is display-only metadata. */
  pull: Partial<{ state: IssueState; assignee: string | null; labels: string[] }>
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

export function snapshotFromLocal(local: LocalTaskFields, labels: string[], now: number): SyncSnapshot {
  return { state: local.state, labels: [...labels], assignee: local.assignee, syncedAt: now }
}

export function reconcile(
  local: LocalTaskFields,
  snapshot: SyncSnapshot,
  remote: RemoteIssueFields,
  now: number,
): ReconcilePlan {
  const plan: ReconcilePlan = {
    push: {},
    pull: {},
    conflicts: [],
    nextSnapshot: { ...snapshot, labels: [...remote.labels], syncedAt: now },
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

  // --- Labels (display only) ---
  if (!sameLabelSet(remote.labels, snapshot.labels)) plan.pull.labels = [...remote.labels]

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
  return local.state !== snapshot.state || local.assignee !== snapshot.assignee
}
