import type { NodeTypes } from "@xyflow/react";
import { FocusTaskNode } from "./FocusTaskNode";
import { ProjectFrameNode } from "./ProjectFrameNode";
import { BoxNode } from "./BoxNode";
import { CircleNode } from "./CircleNode";
import { TextNode } from "./TextNode";
import { PencilNode } from "./PencilNode";
import { NoteNode } from "./NoteNode";

import { RunwayFrameNode } from "./RunwayFrameNode";
import { ImageNode } from "./ImageNode";
import { LinkCardNode } from "./LinkCardNode";
import { ArrowNode } from "./ArrowNode";

export const nodeTypes: NodeTypes = {
  focusTask: FocusTaskNode,
  projectFrame: ProjectFrameNode,
  runwayFrame: RunwayFrameNode,
  box: BoxNode,
  circle: CircleNode,
  text: TextNode,
  pencil: PencilNode,
  note: NoteNode,
  image: ImageNode,
  linkCard: LinkCardNode,
  arrow: ArrowNode,
};

export * from "./CircleNode";
export * from "./RunwayFrameNode";
export * from "./ImageNode";
export * from "./LinkCardNode";
export * from "./ArrowNode";

