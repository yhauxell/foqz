import { BaseBoxShapeTool } from 'tldraw'

export class FocusEnergyShapeTool extends BaseBoxShapeTool {
  static override id = 'focus-energy'
  static override initial = 'idle'
  override shapeType = 'focus-energy'
}
