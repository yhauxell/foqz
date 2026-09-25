import React from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowCanvasApp } from "./FlowCanvas";

export function FlowCanvasAppWrapper() {
  return (
    <ReactFlowProvider>
      <FlowCanvasApp />
    </ReactFlowProvider>
  );
}
