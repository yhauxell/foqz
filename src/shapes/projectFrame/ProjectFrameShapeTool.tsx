import { BaseBoxShapeTool } from "tldraw";

export class ProjectFrameShapeTool extends BaseBoxShapeTool {
  static override id = "project-frame";
  static override initial = "idle";
  override shapeType = "project-frame";
}
