import type { NodeTypes } from "@xyflow/react";
import { FocusTaskNode } from "./FocusTaskNode";
import { ProjectFrameNode } from "./ProjectFrameNode";
import { RectangleNode } from "./RectangleNode";
import { TextNode } from "./TextNode";
import { PencilNode } from "./PencilNode";
import { HandDrawnRectNode } from "./HandDrawnRectNode";

export const nodeTypes: NodeTypes = {
  focusTask: FocusTaskNode,
  projectFrame: ProjectFrameNode,
  rectangle: RectangleNode,
  text: TextNode,
  pencil: PencilNode,
  handDrawnRect: HandDrawnRectNode,
};
