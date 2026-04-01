import { BaseBoxShapeTool } from 'tldraw'

export class FocusTimelineShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-timeline'
  static override initial = 'idle'
  override shapeType = 'focus-timeline'
}
