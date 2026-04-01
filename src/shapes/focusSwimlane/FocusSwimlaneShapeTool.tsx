import { BaseBoxShapeTool } from 'tldraw'

export class FocusSwimlaneShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-swimlane'
  static override initial = 'idle'
  override shapeType = 'focus-swimlane'
}
