import type { Editor, TLShape, TLShapeId } from 'tldraw'
import {
  eisenhowerQuadrantFromGridCell,
  type EisenhowerQuadrant,
} from './focusGridQuadrantTheme'

export type TimelineOrientation = 'horizontal' | 'vertical'

export type TLFocusTimelineLike = TLShape & {
  type: 'focus-timeline'
  props: {
    w: number
    h: number
    startHour: number
    endHour: number
    orientation: TimelineOrientation
  }
}

export type TLFocusPriorityGridLike = TLShape & {
  type: 'focus-priority-grid'
  props: {
    w: number
    h: number
  }
}

const SNAP_PX = 28

/** Inset from each quadrant edge when snapping task cards into the Eisenhower grid */
export const PRIORITY_GRID_CELL_PADDING = 10

/** Gap used when sizing the default grid for 2×2 default cards per quadrant (visual layout math). */
export const PRIORITY_GRID_QUADRANT_GAP = 12

function isPriorityGrid(s: TLShape | undefined): s is TLFocusPriorityGridLike {
  return s?.type === 'focus-priority-grid'
}

function overlapArea(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number }
): number {
  const x0 = Math.max(a.minX, b.minX)
  const y0 = Math.max(a.minY, b.minY)
  const x1 = Math.min(a.maxX, b.maxX)
  const y1 = Math.min(a.maxY, b.maxY)
  if (x1 <= x0 || y1 <= y0) return 0
  return (x1 - x0) * (y1 - y0)
}

/**
 * When a task overlaps a priority grid, **constrain** it to the Eisenhower quadrant under its center
 * (center clamped to the grid bounds first). The padded quadrant is only a boundary: the card keeps its
 * position inside that box, can overlap siblings, and is not pulled to fixed slots. Size is capped so
 * the card can fit the cell. If the shape does not overlap any grid, returns null — move freely between
 * grids or off-canvas without sticky snapping.
 */
export type TaskPriorityGridSnap = {
  x: number
  y: number
  w: number
  h: number
  /** Eisenhower cell under the clamped center — use with `taskPaperForEisenhowerQuadrant` for card color. */
  quadrant: EisenhowerQuadrant
}

export function snapTaskToPriorityGrid(
  editor: Editor,
  taskId: TLShapeId
): TaskPriorityGridSnap | null {
  const shape = editor.getShape(taskId)
  if (!shape || shape.type !== 'focus-task') return null

  const taskBounds = editor.getShapePageBounds(taskId)
  if (!taskBounds) return null

  const taskProps = shape.props as { w: number; h: number }
  const tw = taskProps.w
  const th = taskProps.h

  const grids = editor.getCurrentPageShapes().filter((s): s is TLFocusPriorityGridLike => isPriorityGrid(s))

  let best: { grid: TLFocusPriorityGridLike; area: number } | null = null
  for (const g of grids) {
    const gb = editor.getShapePageBounds(g.id)
    if (!gb) continue
    const area = overlapArea(taskBounds, gb)
    if (area <= 0) continue
    if (!best || area > best.area) best = { grid: g, area }
  }
  if (!best) return null

  const g = best.grid
  const gb = editor.getShapePageBounds(g.id)
  if (!gb) return null

  const pad = PRIORITY_GRID_CELL_PADDING
  const gw = g.props.w
  const gh = g.props.h
  const hw = gw / 2
  const hh = gh / 2

  const cx = Math.min(Math.max(taskBounds.center.x, gb.minX), gb.maxX)
  const cy = Math.min(Math.max(taskBounds.center.y, gb.minY), gb.maxY)

  const relX = cx - g.x
  const relY = cy - g.y
  const col = (relX < hw ? 0 : 1) as 0 | 1
  const row = (relY < hh ? 0 : 1) as 0 | 1
  const quadrant = eisenhowerQuadrantFromGridCell(col, row)

  const cellLeft = g.x + col * hw + pad
  const cellTop = g.y + row * hh + pad
  const innerW = Math.max(0, hw - 2 * pad)
  const innerH = Math.max(0, hh - 2 * pad)
  if (innerW < 8 || innerH < 8) return null

  const newW = Math.min(tw, innerW)
  const newH = Math.min(th, innerH)

  const minX = cellLeft
  const minY = cellTop
  const maxX = cellLeft + innerW - newW
  const maxY = cellTop + innerH - newH
  if (maxX < minX || maxY < minY) return null

  const x = Math.min(Math.max(shape.x, minX), maxX)
  const y = Math.min(Math.max(shape.y, minY), maxY)

  return { x, y, w: newW, h: newH, quadrant }
}

function isTimeline(s: TLShape | undefined): s is TLFocusTimelineLike {
  return s?.type === 'focus-timeline'
}

/** Snap task center to nearest hour slot on overlapping timeline(s). */
export function snapTaskToTimelines(
  editor: Editor,
  taskId: TLShapeId
): { x: number; y: number } | null {
  const shape = editor.getShape(taskId)
  if (!shape || shape.type !== 'focus-task') return null

  const pageBounds = editor.getShapePageBounds(taskId)
  if (!pageBounds) return null

  const cx = pageBounds.center.x
  const cy = pageBounds.center.y

  const timelines = editor
    .getCurrentPageShapes()
    .filter((s): s is TLFocusTimelineLike => isTimeline(s))

  let best: { x: number; y: number; dist: number } | null = null

  for (const tl of timelines) {
    const b = editor.getShapePageBounds(tl.id)
    if (!b) continue
    const pad = SNAP_PX * 2
    if (cx < b.minX - pad || cx > b.maxX + pad || cy < b.minY - pad || cy > b.maxY + pad) {
      continue
    }

    const { startHour, endHour, orientation } = tl.props
    const hours = Math.max(1, endHour - startHour)
    const slots = hours + 1

    if (orientation === 'horizontal') {
      const innerW = Math.max(1, tl.props.w)
      const step = innerW / hours
      const rel = cx - tl.x
      const slot = Math.round(Math.min(slots - 1, Math.max(0, rel / step)))
      const snapX = tl.x + slot * step
      const dist = Math.abs(cx - snapX)
      if (!best || dist < best.dist) {
        best = { x: snapX - pageBounds.width / 2, y: tl.y + tl.props.h / 2 - pageBounds.height / 2, dist }
      }
    } else {
      const innerH = Math.max(1, tl.props.h)
      const step = innerH / hours
      const rel = cy - tl.y
      const slot = Math.round(Math.min(slots - 1, Math.max(0, rel / step)))
      const snapY = tl.y + slot * step
      const dist = Math.abs(cy - snapY)
      if (!best || dist < best.dist) {
        best = { x: tl.x + tl.props.w / 2 - pageBounds.width / 2, y: snapY - pageBounds.height / 2, dist }
      }
    }
  }

  if (!best || best.dist > SNAP_PX * 3) return null
  return { x: best.x, y: best.y }
}
