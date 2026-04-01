import { BaseBoxShapeTool } from 'tldraw'

export class FocusTaskShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-task'
  static override initial = 'idle'
  override shapeType = 'focus-task'
}
