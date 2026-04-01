import { BaseBoxShapeTool } from 'tldraw'

export class FocusPriorityGridShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-priority-grid'
  static override initial = 'idle'
  override shapeType = 'focus-priority-grid'
}
