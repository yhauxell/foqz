import { BaseBoxShapeTool } from 'tldraw'

export class FocusTimerShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-timer'
  static override initial = 'idle'
  override shapeType = 'focus-timer'
}
