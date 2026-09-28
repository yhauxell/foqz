import type { EdgeTypes } from "@xyflow/react";
import { SemanticEdge } from "./SemanticEdge";

export const edgeTypes: EdgeTypes = {
  semantic: SemanticEdge,
  default: SemanticEdge,
};

export * from "./SemanticEdge";
