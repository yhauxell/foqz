import type { NodeTypes } from "@xyflow/react";
import { FocusTaskNode } from "./FocusTaskNode";
import { ProjectFrameNode } from "./ProjectFrameNode";
import { BoxNode } from "./BoxNode";
import { CircleNode } from "./CircleNode";
import { TextNode } from "./TextNode";
import { PencilNode } from "./PencilNode";

export const nodeTypes: NodeTypes = {
  focusTask: FocusTaskNode,
  projectFrame: ProjectFrameNode,
  box: BoxNode,
  circle: CircleNode,
  text: TextNode,
  pencil: PencilNode,
};

export * from "./CircleNode";
