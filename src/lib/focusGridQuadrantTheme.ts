import type { TaskPaperTheme } from '@/shapes/focusTask/FocusTaskShapeUtil'

/**
 * Eisenhower cell keys — must stay aligned with `ZONES` in
 * `FocusPriorityGridShapeUtil` (nw / ne / sw / se).
 */
export const EISENHOWER_QUADRANTS = ['nw', 'ne', 'sw', 'se'] as const
export type EisenhowerQuadrant = (typeof EISENHOWER_QUADRANTS)[number]

/** Maps grid cell indices (same convention as `focusSnap`: col 0 = left, row 0 = top) to quadrant id. */
export function eisenhowerQuadrantFromGridCell(col: 0 | 1, row: 0 | 1): EisenhowerQuadrant {
  if (row === 0) return col === 0 ? 'nw' : 'ne'
  return col === 0 ? 'sw' : 'se'
}

/**
 * Task `paper` theme per Eisenhower quadrant — tuned to echo each zone’s intent
 * (Do now / Schedule / Delegate / Eliminate) using the existing task color schema only.
 */
export const TASK_PAPER_FOR_EISENHOWER_QUADRANT: Record<EisenhowerQuadrant, TaskPaperTheme> = {
  nw: 'bloom',
  ne: 'fog',
  sw: 'cream',
  se: 'sage',
}

export function taskPaperForEisenhowerQuadrant(q: EisenhowerQuadrant): TaskPaperTheme {
  return TASK_PAPER_FOR_EISENHOWER_QUADRANT[q]
}
