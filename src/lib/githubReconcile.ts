/**
 * Pure three-way merge between a canvas item, the GitHub issue it is linked to, and the
 * last-synced snapshot of that issue. No I/O: the sync engine executes the returned plan.
 *
 * A field counts as changed locally when it differs from the snapshot, and as changed remotely
 * when GitHub differs from the snapshot. One-sided changes flow to the other side; changes on
 * both sides that disagree become conflicts and are left untouched until resolved.
 *
 * Synced fields: open/closed state, the primary assignee, and labels. Labels are a set, so they
 * merge instead of conflicting: labels added or removed on either side are applied to the other.
 */

export type IssueState = 'open' | 'closed'
export type SyncField = 'state' | 'assignee'

export interface LocalTaskFields {
  state: IssueState
  assignee: string | null
  labels: string[]
}

export interface RemoteIssueFields {
  state: IssueState
  labels: string[]
  assignee: string | null
}

/** Snapshot format version. Snapshots without it predate label pushing. */
export const SNAPSHOT_VERSION = 2

export interface SyncSnapshot extends RemoteIssueFields {
  /** Epoch ms of the last successful reconcile. */
  syncedAt: number
  v?: number
  /**
   * A local state the user chose not to push (close/reopen set to Ask first or Off). While the task
   * keeps this state it is not treated as a local change, so it is not pushed or asked about again.
   */
  declinedState?: IssueState
}

export interface ReconcilePlan {
  push: {
    state?: IssueState
    assignee?: { from: string | null; to: string | null }
    labels?: { add: string[]; remove: string[] }
  }
  /** Values to write onto the canvas item. */
  pull: Partial<{ state: IssueState; assignee: string | null; labels: string[] }>
  conflicts: SyncField[]
  /** Snapshot to persist once every push in the plan has succeeded. */
  nextSnapshot: SyncSnapshot
}

const lower = (s: string) => s.toLowerCase()
const hasLabel = (list: string[], label: string) => list.some((l) => lower(l) === lower(label))

export function sameLabelSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a.map(lower))
  return b.every((l) => set.has(lower(l)))
}

export function snapshotFromLocal(local: LocalTaskFields, now: number): SyncSnapshot {
  return {
    state: local.state,
    labels: [...local.labels],
    assignee: local.assignee,
    syncedAt: now,
    v: SNAPSHOT_VERSION,
  }
}

function stateChangedLocally(local: LocalTaskFields, snapshot: SyncSnapshot): boolean {
  return local.state !== snapshot.state && local.state !== snapshot.declinedState
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
    nextSnapshot: { ...snapshot, labels: [...remote.labels], syncedAt: now, v: SNAPSHOT_VERSION },
  }
  const next = plan.nextSnapshot

  // --- State (open / closed) ---
  const localState = stateChangedLocally(local, snapshot)
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
  // A declined state stays declined only while the task still differs from GitHub in that way.
  const finalLocalState = plan.pull.state ?? local.state
  if (next.declinedState !== finalLocalState || finalLocalState === next.state) delete next.declinedState

  // --- Labels (set merge: remote, plus what was added here, minus what was removed here) ---
  const addedHere = local.labels.filter((l) => !hasLabel(snapshot.labels, l))
  const removedHere = snapshot.labels.filter((l) => !hasLabel(local.labels, l))
  const add = addedHere.filter((l) => !hasLabel(remote.labels, l))
  const remove = remote.labels.filter((l) => hasLabel(removedHere, l))
  const merged = [...remote.labels.filter((l) => !hasLabel(removedHere, l)), ...add]
  if (add.length > 0 || remove.length > 0) {
    plan.push.labels = { add, remove }
    next.labels = merged
  }
  if (!sameLabelSet(merged, local.labels)) plan.pull.labels = merged

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
    stateChangedLocally(local, snapshot) ||
    local.assignee !== snapshot.assignee ||
    !sameLabelSet(local.labels, snapshot.labels)
  )
}
