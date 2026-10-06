import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import { type NodeProps, type Node } from "@xyflow/react";
import rough from "roughjs";
import { useFlowCanvasStore } from "../store/flowCanvasStore";

export type ArrowSpear = "end" | "start" | "both" | "none";
export type ArrowBorderStyle = "solid" | "dashed" | "dotted";

export interface ArrowNodeData {
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  control?: { x: number; y: number };
  spear?: ArrowSpear;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  borderStyle?: ArrowBorderStyle;
  roughness?: number;
  label?: string;
  [key: string]: unknown;
}

export type ArrowNodeType = Node<ArrowNodeData, "arrow">;

export const ArrowNode = memo(function ArrowNode({
  id,
  data,
  selected,
  width = 240,
  height = 140,
}: NodeProps<ArrowNodeType>) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isDraggingAnchor, setIsDraggingAnchor] = useState<"start" | "end" | "control" | null>(null);
  const isDraggingRef = useRef<"start" | "end" | "control" | null>(null);

  const w = Math.max(60, width);
  const h = Math.max(40, height);

  // Default coordinate geometry relative to node container
  const startX = data.start?.x ?? 20;
  const startY = data.start?.y ?? h - 20;
  const endX = data.end?.x ?? w - 20;
  const endY = data.end?.y ?? 20;
  const controlX = data.control?.x ?? (startX + endX) / 2;
  const controlY = data.control?.y ?? (startY + endY) / 2;

  const spear: ArrowSpear = data.spear || "end";
  const stroke = data.strokeColor || data.color || "#6366f1";
  const strokeWidth = data.strokeWidth || 2.5;
  const borderStyle: ArrowBorderStyle = data.borderStyle || "solid";
  const roughness = data.roughness ?? 1.2;

  // Render curved arrow path and spear heads using Rough.js
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const fragment = document.createDocumentFragment();
    const rc = rough.svg(svg);

    let dashArray: number[] | undefined;
    if (borderStyle === "dashed") dashArray = [6, 4];
    else if (borderStyle === "dotted") dashArray = [2, 4];

    const nodeSeed =
      Math.abs(
        id.split("").reduce((acc, c) => (acc << 5) - acc + c.charCodeAt(0), 0)
      ) || 1;

    // 1. Draw Quadratic Bezier Curved Main Shaft
    const pathD = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
    const curveShape = rc.path(pathD, {
      seed: nodeSeed,
      roughness,
      stroke,
      strokeWidth,
      strokeLineDash: dashArray,
    });
    fragment.appendChild(curveShape);

    // Helper to calculate arrowhead lines
    const addSpear = (
      tipX: number,
      tipY: number,
      ctrlX: number,
      ctrlY: number,
      seedOffset: number
    ) => {
      const angle = Math.atan2(tipY - ctrlY, tipX - ctrlX);
      const headLength = 16;
      const headAngle = Math.PI / 6; // 30 deg

      const leftX = tipX - headLength * Math.cos(angle - headAngle);
      const leftY = tipY - headLength * Math.sin(angle - headAngle);
      const rightX = tipX - headLength * Math.cos(angle + headAngle);
      const rightY = tipY - headLength * Math.sin(angle + headAngle);

      // Rough line for spear wings
      const leftWing = rc.line(tipX, tipY, leftX, leftY, {
        seed: nodeSeed + seedOffset,
        roughness: Math.max(0.4, roughness * 0.7),
        stroke,
        strokeWidth: strokeWidth + 0.5,
      });
      const rightWing = rc.line(tipX, tipY, rightX, rightY, {
        seed: nodeSeed + seedOffset + 1,
        roughness: Math.max(0.4, roughness * 0.7),
        stroke,
        strokeWidth: strokeWidth + 0.5,
      });
      fragment.appendChild(leftWing);
      fragment.appendChild(rightWing);
    };

    // 2. Add arrowhead(s)
    if (spear === "end" || spear === "both") {
      addSpear(endX, endY, controlX, controlY, 10);
    }
    if (spear === "start" || spear === "both") {
      addSpear(startX, startY, controlX, controlY, 20);
    }

    svg.replaceChildren(fragment);
  }, [
    id,
    startX,
    startY,
    endX,
    endY,
    controlX,
    controlY,
    spear,
    stroke,
    strokeWidth,
    borderStyle,
    roughness,
  ]);

  // Handle anchor handle drags (start, end, and middle bend control anchor)
  const handleAnchorPointerDown = useCallback(
    (e: React.PointerEvent, anchor: "start" | "end" | "control") => {
      e.stopPropagation();
      e.preventDefault();
      setIsDraggingAnchor(anchor);
      isDraggingRef.current = anchor;

      const container = svgRef.current?.parentElement;
      if (!container) return;

      const onPointerMove = (moveEvt: PointerEvent) => {
        if (!isDraggingRef.current) return;
        const rect = container.getBoundingClientRect();
        const curX = Math.round(moveEvt.clientX - rect.left);
        const curY = Math.round(moveEvt.clientY - rect.top);

        const currentAnchor = isDraggingRef.current;
        if (currentAnchor === "start") {
          useFlowCanvasStore.getState().updateNodeData(id, {
            start: { x: curX, y: curY },
          });
        } else if (currentAnchor === "end") {
          useFlowCanvasStore.getState().updateNodeData(id, {
            end: { x: curX, y: curY },
          });
        } else if (currentAnchor === "control") {
          useFlowCanvasStore.getState().updateNodeData(id, {
            control: { x: curX, y: curY },
          });
        }
      };

      const onPointerUp = () => {
        setIsDraggingAnchor(null);
        isDraggingRef.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [id]
  );

  return (
    <div
      className={`relative w-full h-full select-none ${
        selected ? "ring-1 ring-indigo-500/50 rounded-lg" : ""
      }`}
      style={{
        width: w,
        height: h,
        overflow: "visible",
        contain: "none",
      }}
    >
      <svg
        ref={svgRef}
        width={w}
        height={h}
        className="w-full h-full overflow-visible pointer-events-none"
      />

      {/* Anchor Handles for Interactivity when Node is Selected */}
      {selected && (
        <>
          {/* Start Point Anchor */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 size-4 rounded-full bg-white dark:bg-zinc-900 border-2 border-indigo-500 hover:scale-125 transition-transform cursor-grab active:cursor-grabbing shadow-md z-20"
            style={{ left: startX, top: startY }}
            onPointerDown={(e) => handleAnchorPointerDown(e, "start")}
            title="Start anchor point"
          />

          {/* Middle Curve Control / Bending Anchor */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 size-4 rounded-full bg-indigo-500 border-2 border-white dark:border-zinc-900 hover:scale-125 transition-transform cursor-grab active:cursor-grabbing shadow-md z-20 flex items-center justify-center ring-2 ring-indigo-400/40"
            style={{ left: controlX, top: controlY }}
            onPointerDown={(e) => handleAnchorPointerDown(e, "control")}
            title="Bend anchor: drag to curve arrow"
          >
            <div className="size-1 rounded-full bg-white" />
          </div>

          {/* End Point / Spear Tip Anchor */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 size-4 rounded-full bg-white dark:bg-zinc-900 border-2 border-indigo-500 hover:scale-125 transition-transform cursor-grab active:cursor-grabbing shadow-md z-20"
            style={{ left: endX, top: endY }}
            onPointerDown={(e) => handleAnchorPointerDown(e, "end")}
            title="End anchor point / arrowhead"
          />

          {/* Guidelines between endpoints and control point when bending */}
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none opacity-30">
            <line
              x1={startX}
              y1={startY}
              x2={controlX}
              y2={controlY}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <line
              x1={endX}
              y1={endY}
              x2={controlX}
              y2={controlY}
              stroke="#6366f1"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          </svg>
        </>
      )}
    </div>
  );
});
