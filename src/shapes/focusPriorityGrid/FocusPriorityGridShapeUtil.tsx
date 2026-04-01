import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'
import { DEFAULT_TASK_CARD_H, DEFAULT_TASK_CARD_W } from '@/lib/focusTaskDimensions'
import { PRIORITY_GRID_CELL_PADDING, PRIORITY_GRID_QUADRANT_GAP } from '@/lib/focusSnap'

/**
 * Math: each quadrant must fit 2×2 cards at default size + gaps, plus `PRIORITY_GRID_CELL_PADDING`
 * on both sides inside the quadrant. Gap matches `PRIORITY_GRID_QUADRANT_GAP` in `focusSnap`.
 */
const HALF_GRID_W = 2 * DEFAULT_TASK_CARD_W + PRIORITY_GRID_QUADRANT_GAP + 2 * PRIORITY_GRID_CELL_PADDING
const HALF_GRID_H = 2 * DEFAULT_TASK_CARD_H + PRIORITY_GRID_QUADRANT_GAP + 2 * PRIORITY_GRID_CELL_PADDING

export const PRIORITY_GRID_DEFAULT_W = 2 * HALF_GRID_W
export const PRIORITY_GRID_DEFAULT_H = 2 * HALF_GRID_H

export type TLFocusPriorityGridShape = TLBaseShape<
  'focus-priority-grid',
  {
    w: number
    h: number
  }
>

/** Keys must match `EisenhowerQuadrant` in `@/lib/focusGridQuadrantTheme` (task paper mapping). */
const ZONES = [
  { key: 'nw', title: 'Do now', sub: 'Urgent + important', bg: 'rgba(254, 226, 226, 0.55)' },
  { key: 'ne', title: 'Schedule', sub: 'Important, not urgent', bg: 'rgba(219, 234, 254, 0.55)' },
  { key: 'sw', title: 'Delegate', sub: 'Urgent, not important', bg: 'rgba(254, 243, 199, 0.55)' },
  { key: 'se', title: 'Eliminate', sub: 'Neither', bg: 'rgba(244, 244, 245, 0.9)' },
] as const

export class FocusPriorityGridShapeUtil extends BaseBoxShapeUtil<TLFocusPriorityGridShape> {
  static override type = 'focus-priority-grid' as const
  static override props = {
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): TLFocusPriorityGridShape['props'] {
    return { w: PRIORITY_GRID_DEFAULT_W, h: PRIORITY_GRID_DEFAULT_H }
  }

  override component(shape: TLFocusPriorityGridShape) {
    return <GridBody shape={shape} />
  }

  override indicator(shape: TLFocusPriorityGridShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} ry={10} />
  }
}

function GridBody({ shape }: { shape: TLFocusPriorityGridShape }) {
  const editor = useEditor()
  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])
  const { w, h } = shape.props
  const hw = w / 2
  const hh = h / 2
  const border = isDark ? '#3f3f46' : '#d4d4d8'

  const cells = [
    { ...ZONES[0], left: 0, top: 0 },
    { ...ZONES[1], left: hw, top: 0 },
    { ...ZONES[2], left: 0, top: hh },
    { ...ZONES[3], left: hw, top: hh },
  ]

  return (
    <HTMLContainer id={shape.id} style={{ width: w, height: h, pointerEvents: 'none' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 10,
          border: `1px solid ${border}`,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        {cells.map((z) => (
          <div
            key={z.key}
            style={{
              position: 'absolute',
              left: z.left,
              top: z.top,
              width: hw,
              height: hh,
              boxSizing: 'border-box',
              borderRight: z.left === 0 ? `1px solid ${border}` : undefined,
              borderBottom: z.top === 0 ? `1px solid ${border}` : undefined,
              background: isDark ? 'rgba(39,39,42,0.5)' : z.bg,
              padding: 10,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, color: isDark ? '#fafafa' : '#18181b' }}>{z.title}</div>
            <div style={{ fontSize: 10, color: isDark ? '#a1a1aa' : '#52525b', marginTop: 2 }}>{z.sub}</div>
          </div>
        ))}
      </div>
    </HTMLContainer>
  )
}
