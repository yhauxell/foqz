import { createShapeId, type Editor } from 'tldraw'
import {
  PRIORITY_GRID_DEFAULT_H,
  PRIORITY_GRID_DEFAULT_W,
} from '@/shapes/focusPriorityGrid/FocusPriorityGridShapeUtil'
import { setLastTemplateDay, todayIso } from './focusMeta'
import { getCachedAppSettings } from './appSettingsCache'

const ORIGIN_X = -200
const ORIGIN_Y = -120

/** Space between the Eisenhower grid and the inbox / energy column */
const GRID_TO_SIDE_COLUMN_GAP = 24

/** Insert daily layout + mark open tasks as carried; optionally move them near inbox. */
export function insertDayTemplate(editor: Editor) {
  const pageId = editor.getCurrentPageId()

  const inboxId = createShapeId()
  const gridId = createShapeId()
  const timelineId = createShapeId()
  const energyId = createShapeId()

  const sideColumnX = ORIGIN_X + PRIORITY_GRID_DEFAULT_W + GRID_TO_SIDE_COLUMN_GAP
  const tlH = 72
  const gap = 24

  const wh = getCachedAppSettings().workingHours
  const startHour = Math.floor(wh.startMin / 60)
  let endHour = Math.ceil(wh.endMin / 60)
  if (endHour === startHour) endHour = startHour + 1
  // Overnight: allow endHour > 24 for the timeline renderer.
  if (wh.endMin < wh.startMin) endHour += 24

  editor.run(() => {
    editor.createShapes([
      {
        id: timelineId,
        type: 'focus-timeline',
        x: ORIGIN_X,
        y: ORIGIN_Y,
        parentId: pageId,
        props: {
          w: PRIORITY_GRID_DEFAULT_W,
          h: tlH,
          startHour,
          endHour,
          orientation: 'horizontal' as const,
        },
      },
      {
        id: gridId,
        type: 'focus-priority-grid',
        x: ORIGIN_X,
        y: ORIGIN_Y + tlH + gap,
        parentId: pageId,
        props: { w: PRIORITY_GRID_DEFAULT_W, h: PRIORITY_GRID_DEFAULT_H },
      },
      {
        id: inboxId,
        type: 'focus-inbox',
        x: sideColumnX,
        y: ORIGIN_Y + tlH + gap,
        parentId: pageId,
        props: { w: 280, h: 200, label: 'Quick capture inbox' },
      },
      {
        id: energyId,
        type: 'focus-energy',
        x: sideColumnX,
        y: ORIGIN_Y + tlH + gap + 220,
        parentId: pageId,
        props: { w: 200, h: 44, level: 3 },
      },
    ])
    editor.sendToBack([gridId, timelineId])

    // Group the main layout so it can be moved together.
    editor.groupShapes([timelineId, gridId, inboxId], { select: false })
    setLastTemplateDay(todayIso())

    const tasks = editor.getCurrentPageShapes().filter((s) => s.type === 'focus-task')
    for (const t of tasks) {
      const st = t.props as { status?: string }
      if (st.status === 'done') continue
      editor.updateShape({
        id: t.id,
        type: 'focus-task',
        props: { ...(t.props as object), carried: true },
      })
    }

    // Nudge open tasks toward inbox column
    const inboxX = sideColumnX + 20
    const inboxY = ORIGIN_Y + 40
    let i = 0
    for (const t of tasks) {
      const st = t.props as { status?: string }
      if (st.status === 'done') continue
      editor.updateShape({
        id: t.id,
        type: 'focus-task',
        x: inboxX,
        y: inboxY + i * 340,
      })
      i++
    }
  })
}
