import React from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowCanvasApp } from "./FlowCanvas";

interface FlowCanvasAppWrapperProps {
  sidebarOpen?: boolean;
}

export function FlowCanvasAppWrapper({ sidebarOpen = false }: FlowCanvasAppWrapperProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasApp sidebarOpen={sidebarOpen} />
    </ReactFlowProvider>
  );
}
