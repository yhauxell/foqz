import { BaseBoxShapeTool } from 'tldraw'

export class FocusInboxShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-inbox'
  static override initial = 'idle'
  override shapeType = 'focus-inbox'
}
