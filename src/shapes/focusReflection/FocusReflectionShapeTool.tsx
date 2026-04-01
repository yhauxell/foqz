import { BaseBoxShapeTool } from 'tldraw'

export class FocusReflectionShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-reflection'
  static override initial = 'idle'
  override shapeType = 'focus-reflection'
}
