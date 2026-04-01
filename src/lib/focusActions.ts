import { createShapeId, type Editor, type VecLike } from 'tldraw'
import { DEFAULT_TASK_CARD_H, DEFAULT_TASK_CARD_W } from '@/lib/focusTaskDimensions'

export function createFocusTask(editor: Editor, point: VecLike, title = 'New task') {
  const id = createShapeId()
  const pageId = editor.getCurrentPageId()
  editor.createShape({
    id,
    type: 'focus-task',
    x: point.x,
    y: point.y,
    parentId: pageId,
    props: {
      w: DEFAULT_TASK_CARD_W,
      h: DEFAULT_TASK_CARD_H,
      title,
      priority: 3,
      estimate: '',
      status: 'open',
      notes: '',
      blocked: false,
      blockedReason: '',
      carried: false,
      paper: 'cream',
      starred: false,
      createdAt: Date.now(),
      trackedMs: 0,
      trackedDayLog: [],
      focusEndAt: null,
      focusSessionStartedAt: null,
      focusPresetMin: 25,
    },
  })
  editor.select(id)
  return id
}
