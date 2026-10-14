/** Minimal label shape so this module stays free of store/network imports. */
type LabelLike = { name: string }

/**
 * Normalizes priority (1=Urgent, 2=High, 3=Normal, 4=Low) based on GitHub label strings.
 */
export function mapLabelsToPriority(labels: (LabelLike | string)[]): 1 | 2 | 3 | 4 {
  const names = labels
    .map((l) => (typeof l === 'string' ? l : l.name).toLowerCase())
    .filter(Boolean)

  if (names.some((n) => n.includes('p0') || n.includes('critical') || n.includes('urgent'))) {
    return 1
  }
  if (names.some((n) => n.includes('p1') || n.includes('high') || n.includes('bug') || n.includes('priority: high'))) {
    return 2
  }
  if (names.some((n) => n.includes('p3') || n.includes('low') || n.includes('deprioritized'))) {
    return 4
  }
  return 3
}

/**
 * Priority labels Foqz writes when a task's priority changes. Each name maps back to the same
 * priority through `mapLabelsToPriority`; P3 (normal) is expressed by having none of them.
 */
export const PRIORITY_LABELS: Record<1 | 2 | 4, string> = {
  1: 'priority: urgent',
  2: 'priority: high',
  4: 'priority: low',
}

export const MANAGED_PRIORITY_LABELS: string[] = Object.values(PRIORITY_LABELS)
