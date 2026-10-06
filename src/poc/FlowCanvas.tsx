import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ConnectionMode,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  PanOnScrollMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./nodes";
import { edgeTypes } from "./edges";
import { FlowZoomControls } from "./components/FlowZoomControls";
import { FlowShapeMenu } from "./components/FlowShapeMenu";
import {
  ReparentConfirmModal,
  type ReparentConfirmState,
  SKIP_REPARENT_KEY,
} from "./components/ReparentConfirmModal";
import { useFlowCanvasShortcuts } from "./hooks/useFlowCanvasShortcuts";
import {
  Pointer,
  CheckSquare,
  Square,
  Circle,
  Type as TypeIcon,
  StickyNote,
  MoveRight,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { ElementInlineChat } from "@/components/ElementInlineChat";
import getStroke from "perfect-freehand";
import {
  useFlowCanvasStore,
  FLOW_STORAGE_KEY,
  INITIAL_NODES,
  INITIAL_EDGES,
  getMaxZIndex,
  findFrameAt,
} from "./store/flowCanvasStore";

function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      return `${acc} ${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2}`;
    },
    `M ${stroke[0][0]},${stroke[0][1]} Q`
  );
  return d;
}

const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_EDGE_OPTIONS = {
  type: "semantic",
  data: { relation: "depends" },
};
const MULTI_SELECTION_KEY_CODE = ["Meta", "Control", "Shift"];
const ZOOM_ACTIVATION_KEY_CODE = ["Meta", "Control"];
const PAN_ON_DRAG: number[] = [1, 2];

export type ActiveTool = "select" | "task" | "box" | "circle" | "text" | "note" | "arrow" | "pencil";

interface FlowCanvasAppProps {
  sidebarOpen?: boolean;
}

export function FlowCanvasApp({ sidebarOpen = false }: FlowCanvasAppProps) {
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const edges = useFlowCanvasStore((s) => s.edges);
  const setNodes = useFlowCanvasStore((s) => s.setNodes);
  const setEdges = useFlowCanvasStore((s) => s.setEdges);
  const setSelectedNodeId = useFlowCanvasStore((s) => s.setSelectedNodeId);
  const loadSnapshot = useFlowCanvasStore((s) => s.loadSnapshot);
  const resetBoard = useFlowCanvasStore((s) => s.resetBoard);

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");

  const selectTool = useCallback(
    (tool: ActiveTool) => {
      setActiveTool(tool);
      if (tool !== "select") {
        setSelectedNodeId(null);
        setNodes((nds) =>
          nds.some((n) => n.selected) ? nds.map((n) => ({ ...n, selected: false })) : nds
        );
      }
    },
    [setSelectedNodeId, setNodes]
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Drag-to-size state for Box tool
  const boxDragStartRef = useRef<{
    flow: { x: number; y: number };
    client: { x: number; y: number };
  } | null>(null);
  const [boxPreviewRect, setBoxPreviewRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Freehand pencil drawing state & live preview overlay (fast 60fps without re-rendering entire ReactFlow graph)
  const isDrawingPencil = useRef(false);
  const currentPencilFlowPoints = useRef<{ x: number; y: number }[]>([]);
  const currentPencilClientPoints = useRef<number[][]>([]);
  const [pencilPreviewSvgPath, setPencilPreviewSvgPath] = useState<string | null>(null);

  // Reparent tracking: preserve exact original coordinates prior to drag
  const dragStartPosRef = useRef<{ id: string; position: { x: number; y: number } } | null>(null);
  const [reparentState, setReparentState] = useState<ReparentConfirmState | null>(null);

  const { screenToFlowPosition, fitView, getInternalNode } = useReactFlow();

  // In-Canvas Chat state
  const [inlineChatNodeId, setInlineChatNodeId] = useState<string | null>(null);

  // 1. Persistence Bridge: Restore snapshot on mount
  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  // 2. Continuous Cursor Tracking in Flow Coordinates
  useEffect(() => {
    let rafId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - lastClientX, e.clientY - lastClientY) < 15) return;
      if (rafId !== null) return;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        try {
          const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          useFlowCanvasStore.getState().setCursorPosition(flowPos);
        } catch {}
      });
    };

    window.addEventListener("pointermove", handleGlobalPointerMove, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", handleGlobalPointerMove);
    };
  }, [screenToFlowPosition]);

  // 3. Viewport Event Listeners (Center-on node, fit view & inline chat)
  useEffect(() => {
    const handleCenterOn = (e: any) => {
      const id = e.detail?.id;
      if (!id) return;
      const fullSpace = Boolean(e.detail?.fullSpace);
      setTimeout(() => {
        const currentNodes = useFlowCanvasStore.getState().nodes;
        const targetNode = currentNodes.find((n) => n.id === id);
        const isFrame =
          targetNode?.type === "projectFrame" || targetNode?.type === "runwayFrame";
        if (fullSpace || isFrame) {
          fitView({
            nodes: [{ id }],
            duration: 400,
            padding: 0.04,
            minZoom: 0.2,
            maxZoom: 2.5,
          });
        } else {
          fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.15, padding: 0.15 });
        }
      }, 50);
    };
    const handleFitView = () => fitView({ duration: 300 });
    const handleZoomReset = () => fitView({ duration: 300, maxZoom: 1, minZoom: 1 });
    const handleOpenInlineChat = (e: any) => {
      const id = e.detail?.nodeId || e.detail?.shapeId || "__canvas__";
      setInlineChatNodeId(id);
    };

    const handleNewTask = (e: any) => {
      const title = e.detail?.title || "New Task";
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const pos = e.detail?.position || useFlowCanvasStore.getState().cursorPosition || center;
      const id = useFlowCanvasStore.getState().createTask({
        title,
        status: "open",
        priority: 3,
        position: pos,
      });
      window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
      setActiveTool("select");
    };

    const handleNewProject = (e: any) => {
      const title = e.detail?.title || "New Project";
      // Calculate screen bounds in flow coordinates to fill visible screen
      const marginX = 80;
      const marginY = 80;
      const topLeft = screenToFlowPosition({ x: marginX, y: marginY });
      const bottomRight = screenToFlowPosition({
        x: Math.max(300, window.innerWidth - marginX),
        y: Math.max(200, window.innerHeight - marginY),
      });

      const frameWidth = Math.max(720, Math.round(bottomRight.x - topLeft.x));
      const frameHeight = Math.max(460, Math.round(bottomRight.y - topLeft.y));
      const pos = e.detail?.position || topLeft;

      const id = useFlowCanvasStore.getState().createProject({
        title,
        goal: "Milestone goal & focus direction",
        accent: "blue",
        position: pos,
        width: frameWidth,
        height: frameHeight,
      });
      window.dispatchEvent(
        new CustomEvent("foqz:flow-center-on", { detail: { id, fullSpace: true } })
      );
      setActiveTool("select");
    };

    const handlePaste = (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable);

      // 1. If inside an active text/input field and pasting a URL over selection, format as [selectedText](url)
      if (isInput) {
        const text = clipboardData.getData("text/plain")?.trim();
        if (text && /^https?:\/\/[^\s]+$/i.test(text)) {
          if (
            activeEl instanceof HTMLInputElement ||
            activeEl instanceof HTMLTextAreaElement
          ) {
            const start = activeEl.selectionStart ?? 0;
            const end = activeEl.selectionEnd ?? 0;
            if (start !== end) {
              e.preventDefault();
              const selectedText = activeEl.value.slice(start, end);
              const linkMarkdown = `[${selectedText}](${text})`;
              const val = activeEl.value;
              activeEl.value = val.slice(0, start) + linkMarkdown + val.slice(end);
              activeEl.selectionStart = start;
              activeEl.selectionEnd = start + linkMarkdown.length;
              activeEl.dispatchEvent(new Event("input", { bubbles: true }));
              return;
            }
          }
        }
        return;
      }

      // 2. Canvas-level paste
      // Check for image files in clipboard
      const items = Array.from(clipboardData.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));

      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            const dataUrl = loadEvent.target?.result as string;
            if (!dataUrl) return;

            const img = new Image();
            img.onload = () => {
              const naturalW = img.naturalWidth || 400;
              const naturalH = img.naturalHeight || 300;
              const displayW = Math.min(480, Math.max(160, naturalW));
              const displayH = Math.round(displayW * (naturalH / naturalW));

              const center = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              });
              const spawnPos = useFlowCanvasStore.getState().cursorPosition || center;

              const store = useFlowCanvasStore.getState();
              const imgId = store.createImage({
                src: dataUrl,
                width: displayW,
                height: displayH,
                position: {
                  x: Math.round(spawnPos.x - displayW / 2),
                  y: Math.round(spawnPos.y - displayH / 2),
                },
              });
              store.setSelectedNodeId(imgId);
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
          return;
        }
      }

      // Check for text/markdown or URL in clipboard
      const text = clipboardData.getData("text/plain");
      if (text && text.trim()) {
        e.preventDefault();
        const trimmed = text.trim();
        const center = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        const spawnPos = useFlowCanvasStore.getState().cursorPosition || center;

        // If pasted content is a standalone URL, spawn as an interactive Link Card!
        if (/^https?:\/\/[^\s]+$/i.test(trimmed)) {
          const id = `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          let domain = trimmed;
          try {
            domain = new URL(trimmed).hostname.replace(/^www\./, "");
          } catch {}

          const newNode: Node = {
            id,
            type: "linkCard",
            position: {
              x: Math.round(spawnPos.x - 160),
              y: Math.round(spawnPos.y - 70),
            },
            style: { width: 320, height: 180 },
            data: {
              url: trimmed,
              title: domain,
              description: trimmed,
              siteName: domain,
              image: null,
            },
            selected: true,
          };

          setNodes((nds) => [
            ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
            newNode,
          ]);
          useFlowCanvasStore.getState().setSelectedNodeId(id);

          // Asynchronously enrich with OpenGraph preview metadata if available
          if (window.focusStore?.fetchOgMetadata) {
            window.focusStore
              .fetchOgMetadata(trimmed)
              .then((meta) => {
                if (meta) {
                  useFlowCanvasStore.getState().updateNodeData(id, {
                    title: meta.title || domain,
                    description: meta.description || trimmed,
                    image: meta.image || null,
                    siteName: meta.siteName || domain,
                  });
                }
              })
              .catch(() => {});
          }
          return;
        }

        const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newNode: Node = {
          id,
          type: "text",
          position: {
            x: Math.round(spawnPos.x - 80),
            y: Math.round(spawnPos.y - 20),
          },
          data: {
            text: trimmed,
            isNew: false,
            autoEdit: false,
          },
          selected: true,
        };

        setNodes((nds) => [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          newNode,
        ]);
        useFlowCanvasStore.getState().setSelectedNodeId(id);
      }
    };

    window.addEventListener("paste", handlePaste);
    window.addEventListener("foqz:flow-center-on", handleCenterOn as EventListener);
    window.addEventListener("foqz:flow-fit-view", handleFitView);
    window.addEventListener("foqz:fit-view", handleFitView);
    window.addEventListener("foqz:flow-zoom-fit", handleFitView);
    window.addEventListener("foqz:flow-zoom-reset", handleZoomReset);
    window.addEventListener("foqz:open-inline-chat", handleOpenInlineChat as EventListener);
    window.addEventListener("foqz:new-task", handleNewTask as EventListener);
    window.addEventListener("foqz:new-project", handleNewProject as EventListener);
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("foqz:flow-center-on", handleCenterOn as EventListener);
      window.removeEventListener("foqz:flow-fit-view", handleFitView);
      window.removeEventListener("foqz:fit-view", handleFitView);
      window.removeEventListener("foqz:flow-zoom-fit", handleFitView);
      window.removeEventListener("foqz:flow-zoom-reset", handleZoomReset);
      window.removeEventListener("foqz:open-inline-chat", handleOpenInlineChat as EventListener);
      window.removeEventListener("foqz:new-task", handleNewTask as EventListener);
      window.removeEventListener("foqz:new-project", handleNewProject as EventListener);
    };
  }, [fitView, screenToFlowPosition, setNodes, setSelectedNodeId]);

  // 3. Debounced Auto-save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          FLOW_STORAGE_KEY,
          JSON.stringify({ nodes, edges, updatedAt: Date.now() })
        );
      } catch (err) {
        console.warn("Failed to save React Flow snapshot:", err);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      const selectionChange = changes.find((c) => c.type === "select");
      if (selectionChange && "selected" in selectionChange) {
        if (selectionChange.selected) {
          setSelectedNodeId(selectionChange.id);
        } else {
          const currentNodes = useFlowCanvasStore.getState().nodes;
          const remainingSelected = currentNodes.find(
            (n) => n.id !== selectionChange.id && n.selected
          );
          setSelectedNodeId(remainingSelected ? remainingSelected.id : null);
        }
      }
    },
    [setNodes, setSelectedNodeId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  // Selected node for the contextual floating color/border menu
  const selectedNode = nodes.find((n) => n.selected) || null;

  // Semantic edge creation handler
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: "semantic",
            data: { relation: "depends" },
          },
          eds
        )
      );
      if (activeTool === "arrow") {
        setActiveTool("select");
      }
    },
    [setEdges, activeTool]
  );

  // Track initial node position on drag start to restore on cancel
  const handleNodeDragStart = useCallback((_event: MouseEvent | TouchEvent, node: Node) => {
    dragStartPosRef.current = { id: node.id, position: { ...node.position } };
  }, []);

  // Reparenting & Detach Logic on Node Drag Stop
  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type === "projectFrame" || node.type === "runwayFrame") return;

      const currentNodes = useFlowCanvasStore.getState().nodes;
      const frames = currentNodes.filter(
        (n) => n.type === "projectFrame" || n.type === "runwayFrame"
      );
      const currentParent = frames.find((f) => f.id === node.parentId);

      // 1. Get exact absolute coordinates directly from React Flow's live internal state
      const nodeInternal = getInternalNode(node.id);
      const nodeAbs = nodeInternal?.internals?.positionAbsolute;

      const parentInternal = currentParent ? getInternalNode(currentParent.id) : undefined;
      const parentAbsX = parentInternal?.internals?.positionAbsolute?.x ?? currentParent?.position.x ?? 0;
      const parentAbsY = parentInternal?.internals?.positionAbsolute?.y ?? currentParent?.position.y ?? 0;

      const absX = nodeAbs?.x ?? (currentParent ? parentAbsX + node.position.x : node.position.x);
      const absY = nodeAbs?.y ?? (currentParent ? parentAbsY + node.position.y : node.position.y);

      const nodeW = nodeInternal?.measured?.width ?? Number(node.style?.width ?? (node.width ?? 260));
      const nodeH = nodeInternal?.measured?.height ?? Number(node.style?.height ?? (node.height ?? 90));
      const nodeCenterX = absX + nodeW / 2;
      const nodeCenterY = absY + nodeH / 2;

      const getFrameMetrics = (f: Node) => {
        const fi = getInternalNode(f.id);
        const fx = fi?.internals?.positionAbsolute?.x ?? f.position.x;
        const fy = fi?.internals?.positionAbsolute?.y ?? f.position.y;
        const fw = fi?.measured?.width ?? Number(f.style?.width ?? (f.width ?? 640));
        const fh = fi?.measured?.height ?? Number(f.style?.height ?? (f.height ?? 420));
        return { fx, fy, fw, fh };
      };

      // Find the best frame candidate for the drop.
      // 1. Prioritize a frame containing the node's center point.
      const frameContainingCenter = frames.find((f) => {
        const { fx, fy, fw, fh } = getFrameMetrics(f);
        return (
          nodeCenterX >= fx &&
          nodeCenterX <= fx + fw &&
          nodeCenterY >= fy &&
          nodeCenterY <= fy + fh
        );
      });

      // 2. If center is outside all frames, check bounding-box overlap (prioritizing another frame over currentParent)
      const targetFrame =
        frameContainingCenter ||
        frames.find((f) => {
          if (currentParent && f.id === currentParent.id) return false;
          const { fx, fy, fw, fh } = getFrameMetrics(f);
          return (
            absX < fx + fw &&
            absX + nodeW > fx &&
            absY < fy + fh &&
            absY + nodeH > fy
          );
        }) ||
        (currentParent &&
        (() => {
          const { fx, fy, fw, fh } = getFrameMetrics(currentParent);
          return absX < fx + fw && absX + nodeW > fx && absY < fy + fh && absY + nodeH > fy
            ? currentParent
            : undefined;
        })());

      // 2. SAME FRAME DROP: If node already belongs to currentParent and was dropped in the same frame
      if (currentParent && targetFrame?.id === currentParent.id) {
        const { fx, fy, fw, fh } = getFrameMetrics(currentParent);
        const isCurrentRunway =
          currentParent.type === "runwayFrame" ||
          String((currentParent.data as any)?.title || "").includes("Runway");

        if (isCurrentRunway && node.type === "focusTask") {
          const dropRelY = Math.round(absY - fy);
          const targetSlotIdx = Math.max(0, Math.min(4, Math.round((dropRelY - 82) / 60)));
          const snapX = 24;
          const snapY = 82 + targetSlotIdx * 60;
          const snapWidth = fw - 48;
          const snapHeight = 50;

          // Check if another task already occupies this target slot
          const otherTaskInSlot = currentNodes.find(
            (n) =>
              n.id !== node.id &&
              n.parentId === currentParent.id &&
              n.type === "focusTask" &&
              Math.abs(n.position.y - snapY) < 30
          );

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id === node.id) {
                return {
                  ...n,
                  parentId: currentParent.id,
                  position: { x: snapX, y: snapY },
                  style: { ...n.style, width: snapWidth, height: snapHeight },
                  width: snapWidth,
                  height: snapHeight,
                  selected: true,
                };
              }
              if (otherTaskInSlot && n.id === otherTaskInSlot.id) {
                // Swap other task to previous slot of dragged node
                const oldSlotIdx = Math.max(0, Math.min(4, Math.round((node.position.y - 82) / 60)));
                return {
                  ...n,
                  position: { x: snapX, y: 82 + oldSlotIdx * 60 },
                  style: { ...n.style, width: snapWidth, height: snapHeight },
                  width: snapWidth,
                  height: snapHeight,
                };
              }
              return n;
            })
          );
          return;
        }

        // Still inside the same regular project frame!
        const relX = Math.max(16, Math.min(fw - nodeW - 16, Math.round(absX - fx)));
        const relY = Math.max(55, Math.min(fh - nodeH - 16, Math.round(absY - fy)));

        setNodes((nds) =>
          nds.map((n) =>
            n.id === node.id
              ? {
                  ...n,
                  parentId: currentParent.id,
                  position: { x: relX, y: relY },
                  selected: true,
                }
              : n
          )
        );
        return;
      }

      // 3. DIFFERENT FRAME DROP: Node was dropped into a different project frame or runway
      if (targetFrame && (!currentParent || targetFrame.id !== currentParent.id)) {
        const { fx, fy, fw, fh } = getFrameMetrics(targetFrame);
        const isTargetRunway =
          targetFrame.type === "runwayFrame" ||
          String((targetFrame.data as any)?.title || "").includes("Runway");

        let relX: number;
        let relY: number;
        let targetStyle = { ...node.style };
        let updatedData = { ...node.data };

        if (isTargetRunway && node.type === "focusTask") {
          const dropRelY = Math.round(absY - fy);
          const targetSlotIdx = Math.max(0, Math.min(4, Math.round((dropRelY - 82) / 60)));

          const existingRunwayTasks = currentNodes.filter(
            (n) => n.id !== node.id && n.parentId === targetFrame.id && n.type === "focusTask"
          );
          const occupiedSlotIndices = new Set(
            existingRunwayTasks.map((t) => Math.round((t.position.y - 82) / 60))
          );

          let chosenSlot = targetSlotIdx;
          if (occupiedSlotIndices.has(chosenSlot)) {
            for (let offset = 1; offset <= 4; offset++) {
              if (chosenSlot + offset <= 4 && !occupiedSlotIndices.has(chosenSlot + offset)) {
                chosenSlot = chosenSlot + offset;
                break;
              }
              if (chosenSlot - offset >= 0 && !occupiedSlotIndices.has(chosenSlot - offset)) {
                chosenSlot = chosenSlot - offset;
                break;
              }
            }
          }

          relX = 24;
          relY = 82 + chosenSlot * 60;
          targetStyle = { ...targetStyle, width: fw - 48, height: 50 };

          // Stow connected edges into node data and remove them from canvas edges
          const allCurrentEdges = useFlowCanvasStore.getState().edges;
          const connectedEdges = allCurrentEdges.filter(
            (e) => e.source === node.id || e.target === node.id
          );
          if (connectedEdges.length > 0) {
            const existingStowed = ((node.data as any)?.stowedEdges as Edge[]) || [];
            const mergedStowed = [
              ...existingStowed,
              ...connectedEdges.filter((ce) => !existingStowed.some((se) => se.id === ce.id)),
            ];
            updatedData = {
              ...updatedData,
              stowedEdges: mergedStowed,
            };
            const setEdges = useFlowCanvasStore.getState().setEdges;
            setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
          }

          // If came from a projectFrame, record originProjectId
          if (currentParent && currentParent.type === "projectFrame") {
            updatedData = {
              ...updatedData,
              originProjectId: currentParent.id,
              originProjectTitle: (currentParent.data as any)?.title || "Project",
              originProjectAccent: (currentParent.data as any)?.accent || "blue",
              originProjectPos: { x: node.position.x, y: node.position.y },
              stagedAt: Date.now(),
            };
          }
          // If already had originProjectId (e.g. hopped from Runway 1 to Runway 2), preserve it!
        } else {
          relX = Math.max(16, Math.min(fw - 280 - 16, Math.round(absX - fx)));
          relY = Math.max(55, Math.min(fh - 82 - 16, Math.round(absY - fy)));
          if (node.type === "focusTask") {
            targetStyle = { ...targetStyle, width: 280, height: 82 };
          }

          // Dropped into another project frame: clear runway staging data and recreate stowed edges!
          const stowedEdges = ((node.data as any)?.stowedEdges as Edge[]) || [];
          if (stowedEdges.length > 0) {
            const setEdges = useFlowCanvasStore.getState().setEdges;
            setEdges((currentEdges) => [
              ...currentEdges,
              ...stowedEdges.filter((se) => !currentEdges.some((e) => e.id === se.id)),
            ]);
          }
          delete (updatedData as any).originProjectId;
          delete (updatedData as any).originProjectTitle;
          delete (updatedData as any).originProjectAccent;
          delete (updatedData as any).originProjectPos;
          delete (updatedData as any).stagedAt;
          delete (updatedData as any).stowedEdges;
        }

        setNodes((nds) => {
          const withoutNode = nds.filter((n) => n.id !== node.id);
          const parentIdx = withoutNode.findIndex((n) => n.id === targetFrame.id);
          const updatedNode = {
            ...node,
            parentId: targetFrame.id,
            position: { x: relX, y: relY },
            style: targetStyle,
            width: isTargetRunway ? fw - 48 : 280,
            height: isTargetRunway ? 50 : 82,
            data: updatedData,
            selected: true,
          };
          delete (updatedNode as any).extent;

          if (parentIdx !== -1) {
            const result = [...withoutNode];
            result.splice(parentIdx + 1, 0, updatedNode);
            return result;
          }
          return [...withoutNode, updatedNode];
        });
        return;
      }

      // 4. Node had a parent, but was dragged COMPLETELY OUTSIDE onto open canvas!
      if (currentParent) {
        const nodeTitle =
          (node.data?.title as string) ||
          (node.data?.label as string) ||
          (node.data?.text as string) ||
          "Item";
        const parentTitle =
          (currentParent?.data?.title as string) || "Project Frame";

        const skipConfirm =
          typeof window !== "undefined" &&
          localStorage.getItem(SKIP_REPARENT_KEY) === "true";

        const isParentRunway =
          currentParent.type === "runwayFrame" ||
          String((currentParent.data as any)?.title || "").includes("Runway");
        const stylePatch =
          isParentRunway && node.type === "focusTask"
            ? { width: 280, height: 82 }
            : {};

        if (skipConfirm) {
          // Immediately detach without asking
          const stowedEdges = ((node.data as any)?.stowedEdges as Edge[]) || [];
          if (stowedEdges.length > 0) {
            const setEdges = useFlowCanvasStore.getState().setEdges;
            setEdges((currentEdges) => [
              ...currentEdges,
              ...stowedEdges.filter((se) => !currentEdges.some((e) => e.id === se.id)),
            ]);
          }

          setNodes((nds) =>
            nds.map((n) => {
              if (n.id !== node.id) return n;
              const cleanData = { ...n.data };
              delete cleanData.stowedEdges;
              const detached = { ...n, style: { ...n.style, ...stylePatch }, data: cleanData };
              delete detached.parentId;
              delete detached.extent;
              return {
                ...detached,
                position: { x: Math.round(absX), y: Math.round(absY) },
              };
            })
          );
        } else {
          // Open confirmation modal with preserved pre-drag coordinate
          const origPos =
            dragStartPosRef.current?.id === node.id
              ? dragStartPosRef.current.position
              : { x: node.position.x, y: node.position.y };

          setReparentState({
            isOpen: true,
            nodeId: node.id,
            nodeTitle,
            parentTitle,
            originalPosition: origPos,
            targetAbsolutePosition: {
              x: Math.round(absX),
              y: Math.round(absY),
            },
          });
        }
      }
    },
    [getInternalNode, setNodes]
  );

  const handleConfirmReparent = (rememberChoice: boolean) => {
    if (!reparentState) return;
    if (rememberChoice && typeof window !== "undefined") {
      localStorage.setItem(SKIP_REPARENT_KEY, "true");
    }

    setNodes((nds) => {
      const targetNode = nds.find((n) => n.id === reparentState.nodeId);
      const parentNode = targetNode?.parentId
        ? nds.find((p) => p.id === targetNode.parentId)
        : null;
      const isParentRunway =
        parentNode &&
        (parentNode.type === "runwayFrame" ||
          String((parentNode.data as any)?.title || "").includes("Runway"));
      const stylePatch =
        isParentRunway && targetNode?.type === "focusTask"
          ? { width: 280, height: 82 }
          : {};

      const stowedEdges = ((targetNode?.data as any)?.stowedEdges as Edge[]) || [];
      if (stowedEdges.length > 0) {
        const setEdges = useFlowCanvasStore.getState().setEdges;
        setEdges((currentEdges) => [
          ...currentEdges,
          ...stowedEdges.filter((se) => !currentEdges.some((e) => e.id === se.id)),
        ]);
      }

      return nds.map((n) => {
        if (n.id !== reparentState.nodeId) return n;
        const cleanData = { ...n.data };
        delete cleanData.stowedEdges;
        const detached = { ...n, style: { ...n.style, ...stylePatch }, data: cleanData };
        delete detached.parentId;
        delete detached.extent;
        return {
          ...detached,
          position: reparentState.targetAbsolutePosition,
        };
      });
    });
    setReparentState(null);
  };

  const handleCancelReparent = () => {
    // Revert position cleanly to its original pre-drag coordinates
    if (reparentState) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== reparentState.nodeId) return n;
          return {
            ...n,
            position: reparentState.originalPosition,
          };
        })
      );
    }
    setReparentState(null);
  };

  // Helper spawners
  const handleCreateTaskAt = useCallback(
    (pos: { x: number; y: number }) => {
      const id = `task-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);
      const frameMatch = findFrameAt(pos, currentNodes);

      if (frameMatch) {
        const isFrameRunway =
          frameMatch.frame.type === "runwayFrame" ||
          String((frameMatch.frame.data as any)?.title || "").includes("Runway");
        const frameW = Number(
          frameMatch.frame.style?.width ?? frameMatch.frame.width ?? 680
        );
        const taskStyle = isFrameRunway
          ? { width: frameW - 48, height: 50, zIndex: nextZ }
          : { width: 280, height: 82, zIndex: nextZ };

        const newNode: Node = {
          id,
          type: "focusTask",
          parentId: frameMatch.frame.id,
          position: { x: frameMatch.relX, y: frameMatch.relY },
          style: taskStyle,
          data: {
            title: "New Task Card",
            status: "open",
            priority: 3,
            paper: "cream",
            borderStyle: "solid",
          },
        };
        setNodes((nds) => {
          const parentIdx = nds.findIndex((n) => n.id === frameMatch.frame.id);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < nds.length && nds[insertIdx].parentId === frameMatch.frame.id) {
              insertIdx++;
            }
            const copy = [...nds];
            copy.splice(insertIdx, 0, newNode);
            return copy;
          }
          return [...nds, newNode];
        });
      } else {
        const newNode: Node = {
          id,
          type: "focusTask",
          position: { x: pos.x - 130, y: pos.y - 41 },
          style: { width: 280, height: 82, zIndex: nextZ },
          data: {
            title: "New Task Card",
            status: "open",
            priority: 3,
            paper: "cream",
            borderStyle: "solid",
          },
        };
        setNodes((nds) => [...nds, newNode]);
      }
      setSelectedNodeId(id);
      setActiveTool("select");
    },
    [setNodes, setSelectedNodeId]
  );

  const handleCreateBoxAt = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const id = `box-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);
      const frameMatch = findFrameAt({ x: x + w / 2, y: y + h / 2 }, currentNodes);

      if (frameMatch) {
        const fx = frameMatch.frame.position.x;
        const fy = frameMatch.frame.position.y;
        const newNode: Node = {
          id,
          type: "box",
          parentId: frameMatch.frame.id,
          position: {
            x: Math.max(20, Math.round(x - fx)),
            y: Math.max(68, Math.round(y - fy)),
          },
          style: { width: w, height: h, zIndex: nextZ },
          data: {
            label: "Sketch Box",
            color: "rgba(16, 185, 129, 0.08)",
            strokeColor: "#10b981",
            roughness: 1.8,
            borderStyle: "solid",
          },
        };
        setNodes((nds) => {
          const parentIdx = nds.findIndex((n) => n.id === frameMatch.frame.id);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < nds.length && nds[insertIdx].parentId === frameMatch.frame.id) {
              insertIdx++;
            }
            const copy = [...nds];
            copy.splice(insertIdx, 0, newNode);
            return copy;
          }
          return [...nds, newNode];
        });
      } else {
        const newNode: Node = {
          id,
          type: "box",
          position: { x, y },
          style: { width: w, height: h, zIndex: nextZ },
          data: {
            label: "Sketch Box",
            color: "rgba(16, 185, 129, 0.08)",
            strokeColor: "#10b981",
            roughness: 1.8,
            borderStyle: "solid",
          },
        };
        setNodes((nds) => [...nds, newNode]);
      }
      setSelectedNodeId(id);
      setActiveTool("select");
    },
    [setNodes, setSelectedNodeId]
  );

  const handleCreateCircleAt = useCallback(
    (x: number, y: number, w: number, h: number) => {
      const id = `circle-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);
      const frameMatch = findFrameAt({ x: x + w / 2, y: y + h / 2 }, currentNodes);

      if (frameMatch) {
        const fx = frameMatch.frame.position.x;
        const fy = frameMatch.frame.position.y;
        const newNode: Node = {
          id,
          type: "circle",
          parentId: frameMatch.frame.id,
          position: {
            x: Math.max(20, Math.round(x - fx)),
            y: Math.max(68, Math.round(y - fy)),
          },
          style: { width: w, height: h, zIndex: nextZ },
          data: {
            label: "Circle",
            color: "rgba(99, 102, 241, 0.08)",
            strokeColor: "#6366f1",
            roughness: 1.8,
            borderStyle: "solid",
          },
        };
        setNodes((nds) => {
          const parentIdx = nds.findIndex((n) => n.id === frameMatch.frame.id);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < nds.length && nds[insertIdx].parentId === frameMatch.frame.id) {
              insertIdx++;
            }
            const copy = [...nds];
            copy.splice(insertIdx, 0, newNode);
            return copy;
          }
          return [...nds, newNode];
        });
      } else {
        const newNode: Node = {
          id,
          type: "circle",
          position: { x, y },
          style: { width: w, height: h, zIndex: nextZ },
          data: {
            label: "Circle",
            color: "rgba(99, 102, 241, 0.08)",
            strokeColor: "#6366f1",
            roughness: 1.8,
            borderStyle: "solid",
          },
        };
        setNodes((nds) => [...nds, newNode]);
      }
      setSelectedNodeId(id);
      setActiveTool("select");
    },
    [setNodes, setSelectedNodeId]
  );

  const handleCreateTextAt = useCallback(
    (pos: { x: number; y: number }) => {
      const id = `text-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);
      const frameMatch = findFrameAt(pos, currentNodes);

      if (frameMatch) {
        const newNode: Node = {
          id,
          type: "text",
          parentId: frameMatch.frame.id,
          position: { x: frameMatch.relX, y: frameMatch.relY },
          style: { zIndex: nextZ },
          data: {
            text: "",
            isNew: true,
          },
          selected: true,
        };
        setNodes((nds) => {
          const cleared = nds.map((n) => (n.selected ? { ...n, selected: false } : n));
          const parentIdx = cleared.findIndex((n) => n.id === frameMatch.frame.id);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < cleared.length && cleared[insertIdx].parentId === frameMatch.frame.id) {
              insertIdx++;
            }
            const copy = [...cleared];
            copy.splice(insertIdx, 0, newNode);
            return copy;
          }
          return [...cleared, newNode];
        });
      } else {
        const newNode: Node = {
          id,
          type: "text",
          position: pos,
          style: { zIndex: nextZ },
          data: {
            text: "",
            isNew: true,
          },
          selected: true,
        };
        setNodes((nds) => [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          newNode,
        ]);
      }
      setSelectedNodeId(id);
      setActiveTool("select");
    },
    [setNodes, setSelectedNodeId]
  );

  const handleCreateNoteAt = useCallback(
    (pos: { x: number; y: number }) => {
      const id = `note-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);
      const frameMatch = findFrameAt(pos, currentNodes);

      if (frameMatch) {
        const newNode: Node = {
          id,
          type: "note",
          parentId: frameMatch.frame.id,
          position: { x: frameMatch.relX, y: frameMatch.relY },
          style: { width: 240, height: 180, zIndex: nextZ },
          data: {
            title: "Note",
            text: "",
            variant: "yellow",
            corner: "folded",
            foldPosition: "top-right",
            noise: true,
            isNew: true,
            autoEdit: true,
          },
          selected: true,
        };
        setNodes((nds) => {
          const cleared = nds.map((n) => (n.selected ? { ...n, selected: false } : n));
          const parentIdx = cleared.findIndex((n) => n.id === frameMatch.frame.id);
          if (parentIdx !== -1) {
            let insertIdx = parentIdx + 1;
            while (insertIdx < cleared.length && cleared[insertIdx].parentId === frameMatch.frame.id) {
              insertIdx++;
            }
            const copy = [...cleared];
            copy.splice(insertIdx, 0, newNode);
            return copy;
          }
          return [...cleared, newNode];
        });
      } else {
        const newNode: Node = {
          id,
          type: "note",
          position: pos,
          style: { width: 240, height: 180, zIndex: nextZ },
          data: {
            title: "Note",
            text: "",
            variant: "yellow",
            corner: "folded",
            foldPosition: "top-right",
            noise: true,
            isNew: true,
            autoEdit: true,
          },
          selected: true,
        };
        setNodes((nds) => [
          ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
          newNode,
        ]);
      }
      setSelectedNodeId(id);
      setActiveTool("select");
    },
    [setNodes, setSelectedNodeId]
  );

  const handleCreateProject = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("foqz:new-project", { detail: { fullSpace: true } })
    );
  }, []);

  const handleCreateTask = useCallback(() => {
    const store = useFlowCanvasStore.getState();
    let spawnPos = store.cursorPosition;
    if (!spawnPos && typeof window !== "undefined") {
      spawnPos = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
    }

    const id = store.createTask({
      title: "New Task",
      status: "open",
      priority: 3,
      position: spawnPos || undefined,
    });
    window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
    setActiveTool("select");
  }, [screenToFlowPosition]);

  const handleDeleteSelected = useCallback(() => {
    const currentNodes = useFlowCanvasStore.getState().nodes;
    const currentEdges = useFlowCanvasStore.getState().edges;

    const selectedNodes = currentNodes.filter((n) => n.selected);
    const selectedEdges = currentEdges.filter((e) => e.selected);

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // 1. Collect all node IDs to delete (including child nodes if a parent projectFrame is deleted)
    const allDeletedNodeIds = new Set<string>();
    if (selectedNodes.length > 0) {
      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      currentNodes.forEach((n) => {
        if (selectedNodeIds.has(n.id) || (n.parentId && selectedNodeIds.has(n.parentId))) {
          allDeletedNodeIds.add(n.id);
        }
      });
    }

    // 2. Collect all edge IDs to delete (directly selected edges + edges attached to deleted nodes)
    const allDeletedEdgeIds = new Set<string>(selectedEdges.map((e) => e.id));
    if (allDeletedNodeIds.size > 0) {
      currentEdges.forEach((e) => {
        if (allDeletedNodeIds.has(e.source) || allDeletedNodeIds.has(e.target)) {
          allDeletedEdgeIds.add(e.id);
        }
      });
      setNodes((nds) => nds.filter((n) => !allDeletedNodeIds.has(n.id)));
      if (allDeletedNodeIds.has(useFlowCanvasStore.getState().selectedNodeId || "")) {
        setSelectedNodeId(null);
      }
    }

    // 3. Delete matching edges
    if (allDeletedEdgeIds.size > 0) {
      setEdges((eds) => eds.filter((e) => !allDeletedEdgeIds.has(e.id)));
    }
  }, [setNodes, setEdges, setSelectedNodeId]);

  const handleEscape = useCallback(() => {
    setActiveTool("select");
    setInlineChatNodeId(null);
    boxDragStartRef.current = null;
    setBoxPreviewRect(null);
    isDrawingPencil.current = false;
    setPencilPreviewSvgPath(null);
    currentPencilFlowPoints.current = [];
    currentPencilClientPoints.current = [];
    setNodes((nds) =>
      nds.map((n) => (n.selected ? { ...n, selected: false } : n))
    );
    setEdges((eds) =>
      eds.map((e) => (e.selected ? { ...e, selected: false } : e))
    );
  }, [setNodes, setEdges]);

  const handleCenterFront = useCallback(() => {
    const currentNodes = useFlowCanvasStore.getState().nodes;
    const selNode = currentNodes.find((n) => n.selected);
    const currentEdges = useFlowCanvasStore.getState().edges;
    const selEdge = currentEdges.find((e) => e.selected);

    if (selNode) {
      // 1. Center camera on the selected node
      fitView({
        nodes: [{ id: selNode.id }],
        duration: 300,
        maxZoom: 1.1,
      });

      // 2. Bring to front: elevate zIndex and move towards top of stacking order
      setNodes((nds) => {
        const target = nds.find((n) => n.id === selNode.id);
        if (!target) return nds;

        const without = nds.filter((n) => n.id !== selNode.id);
        if (target.parentId) {
          const parentIndex = without.findIndex((n) => n.id === target.parentId);
          if (parentIndex !== -1) {
            let lastSiblingIdx = parentIndex;
            for (let i = parentIndex + 1; i < without.length; i++) {
              if (without[i].parentId === target.parentId) {
                lastSiblingIdx = i;
              }
            }
            const maxZ = getMaxZIndex(nds);
            const nextZ = Math.max(100, maxZ + 1);
            const res = [...without];
            res.splice(lastSiblingIdx + 1, 0, {
              ...target,
              style: { ...target.style, zIndex: nextZ },
            });
            return res;
          }
        }
        if (target.type === "projectFrame" || target.type === "runwayFrame") {
          // Keep project and runway frames at base container level so child tasks stay above it
          return [target, ...without];
        }
        const maxZ = getMaxZIndex(nds);
        const nextZ = Math.max(100, maxZ + 1);
        return [...without, { ...target, style: { ...target.style, zIndex: nextZ } }];
      });
    } else if (selEdge) {
      fitView({
        nodes: [{ id: selEdge.source }, { id: selEdge.target }],
        duration: 300,
        maxZoom: 1.1,
      });
    } else {
      fitView({ duration: 300 });
    }
  }, [fitView, setNodes]);

  // Unified Keyboard Shortcuts Hook (disabled during modal dialogs)
  useFlowCanvasShortcuts({
    enabled: !reparentState?.isOpen,
    onSelectTool: () => selectTool("select"),
    onBoxTool: () => selectTool("box"),
    onCircleTool: () => selectTool("circle"),
    onTextTool: () => selectTool("text"),
    onNoteTool: () => selectTool("note"),
    onArrowTool: () => selectTool("arrow"),
    onPencilTool: () => selectTool("pencil"),
    onCreateTask: handleCreateTask,
    onCreateProject: handleCreateProject,
    onSendToRunway: () => {
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const sel = currentNodes.find((n) => n.selected && n.type === "focusTask");
      if (sel) {
        useFlowCanvasStore.getState().sendTaskToRunway(sel.id);
      }
    },
    onFocusMode: () => {
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const currentActiveFocus = useFlowCanvasStore.getState().activeFocusNodeId;
      const sel = currentNodes.find((n) => n.selected);
      let targetId: string | null = null;

      if (sel) {
        if (sel.type === "runwayFrame" || String((sel.data as any)?.title || "").includes("Runway")) {
          // If runway is selected, find its active flight or first open task!
          const runwayTasks = currentNodes
            .filter((n) => n.parentId === sel.id && n.type === "focusTask")
            .sort((a, b) => a.position.y - b.position.y);
          const activeTask =
            runwayTasks.find((t) => t.id === currentActiveFocus) ||
            runwayTasks.find((t) => (t.data as any)?.status === "doing") ||
            runwayTasks.find((t) => (t.data as any)?.status !== "done") ||
            runwayTasks[0];
          targetId = activeTask ? activeTask.id : sel.id;
        } else if (sel.type === "projectFrame") {
          const projectTasks = currentNodes
            .filter((n) => n.parentId === sel.id && n.type === "focusTask")
            .sort((a, b) => a.position.y - b.position.y);
          const activeTask =
            projectTasks.find((t) => (t.data as any)?.status === "doing") ||
            projectTasks.find((t) => (t.data as any)?.status !== "done") ||
            projectTasks[0];
          targetId = activeTask ? activeTask.id : sel.id;
        } else {
          targetId = sel.id;
        }
      } else {
        // No selection: check runway first, then doing, then open
        const runway = currentNodes.find((n) => n.type === "runwayFrame");
        if (runway) {
          const runwayTasks = currentNodes
            .filter((n) => n.parentId === runway.id && n.type === "focusTask")
            .sort((a, b) => a.position.y - b.position.y);
          const activeTask =
            runwayTasks.find((t) => t.id === currentActiveFocus) ||
            runwayTasks.find((t) => (t.data as any)?.status === "doing") ||
            runwayTasks.find((t) => (t.data as any)?.status !== "done");
          if (activeTask) targetId = activeTask.id;
        }
        if (!targetId) {
          targetId =
            currentNodes.find((n) => n.type === "focusTask" && (n.data as any)?.status === "doing")?.id ||
            currentNodes.find((n) => n.type === "focusTask" && (n.data as any)?.status === "open")?.id ||
            currentNodes.find((n) => n.type === "focusTask")?.id || null;
        }
      }

      if (targetId) {
        useFlowCanvasStore.getState().setActiveFocusNodeId(targetId);
        useFlowCanvasStore.getState().setIsTimerRunning(true);
        window.dispatchEvent(
          new CustomEvent("foqz:set-focus-target", { detail: { shapeId: targetId } })
        );
        window.dispatchEvent(
          new CustomEvent("foqz:flow-center-on", { detail: { id: targetId } })
        );
      } else {
        fitView({ duration: 300 });
      }
    },
    onCenterFront: handleCenterFront,
    onInlineChat: () => {
      const sel = nodes.find((n) => n.selected);
      if (sel) {
        setInlineChatNodeId((prev) => (prev === sel.id ? null : sel.id));
      } else {
        handleCenterFront();
      }
    },
    onDeleteSelected: handleDeleteSelected,
    onDuplicateSelected: () => useFlowCanvasStore.getState().duplicateSelected(),
    onUndo: () => useFlowCanvasStore.temporal.getState().undo(),
    onRedo: () => useFlowCanvasStore.temporal.getState().redo(),
    onFitView: () => fitView({ duration: 300 }),
    onToggleShortcutsModal: () => {
      window.dispatchEvent(new CustomEvent("foqz:open-shortcuts"));
    },
    onEscape: handleEscape,
  });

  // Canvas Click Handler (Click-to-place for Task, Text, and Note)
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      if (activeTool === "task") {
        handleCreateTaskAt(pos);
      } else if (activeTool === "text") {
        handleCreateTextAt(pos);
      } else if (activeTool === "note") {
        handleCreateNoteAt(pos);
      } else {
        setEdges((eds) =>
          eds.some((e) => e.selected)
            ? eds.map((e) => (e.selected ? { ...e, selected: false } : e))
            : eds
        );
      }
    },
    [activeTool, screenToFlowPosition, handleCreateTaskAt, handleCreateTextAt, handleCreateNoteAt, setEdges]
  );

  // Node Click Handler (Places task/text/note inside node if tool active, otherwise selects node)
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (activeTool === "task") {
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        handleCreateTaskAt(pos);
        return;
      }
      if (activeTool === "text") {
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        handleCreateTextAt(pos);
        return;
      }
      if (activeTool === "note") {
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        handleCreateNoteAt(pos);
        return;
      }
      if (activeTool === "select") {
        setSelectedNodeId(node.id);
      }
    },
    [activeTool, screenToFlowPosition, handleCreateTaskAt, handleCreateTextAt, handleCreateNoteAt, setSelectedNodeId]
  );

  // Edge Click Handler (Selects edge, deselects nodes)
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setEdges((eds) =>
        eds.map((e) => ({ ...e, selected: e.id === edge.id }))
      );
      setNodes((nds) =>
        nds.map((n) => (n.selected ? { ...n, selected: false } : n))
      );
      setSelectedNodeId(null);
    },
    [setEdges, setNodes, setSelectedNodeId]
  );

  // Double Click Canvas to Create Text Note (strictly on canvas background, unaffected by SVG background dots)
  const handlePaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement | SVGElement | null;
      if (
        target &&
        !target.closest?.(".react-flow__node") &&
        !target.closest?.(".react-flow__edge") &&
        !target.closest?.("button")
      ) {
        const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        handleCreateTextAt(pos);
      }
    },
    [screenToFlowPosition, handleCreateTextAt]
  );

  // Pointer Down (Box/Circle Drag-to-size OR Pencil drawing)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only tools that require drag-drawing (pencil, box, circle) need pointer capture.
    // Task, text, select, and arrow tools must NOT capture pointer, ensuring click-to-place and node clicks work!
    if (activeTool !== "pencil" && activeTool !== "box" && activeTool !== "circle") return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}

    if (activeTool === "pencil") {
      isDrawingPencil.current = true;
      const containerRect = containerRef.current?.getBoundingClientRect();
      const clientX = e.clientX - (containerRect?.left ?? 0);
      const clientY = e.clientY - (containerRect?.top ?? 0);
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      currentPencilFlowPoints.current = [flowPos];
      currentPencilClientPoints.current = [[clientX, clientY]];
      const stroke = getStroke(currentPencilClientPoints.current, {
        size: 6,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });
      setPencilPreviewSvgPath(getSvgPathFromStroke(stroke));
    } else if (activeTool === "box" || activeTool === "circle") {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const clientX = e.clientX - (containerRect?.left ?? 0);
      const clientY = e.clientY - (containerRect?.top ?? 0);
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      boxDragStartRef.current = {
        flow: flowPos,
        client: { x: clientX, y: clientY },
      };
      setBoxPreviewRect({ x: clientX, y: clientY, w: 0, h: 0 });
    }
  };

  // Pointer Move (Box/Circle Drag-to-size OR Pencil drawing)
  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === "pencil" && isDrawingPencil.current) {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const clientX = e.clientX - (containerRect?.left ?? 0);
      const clientY = e.clientY - (containerRect?.top ?? 0);
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      currentPencilFlowPoints.current.push(flowPos);
      currentPencilClientPoints.current.push([clientX, clientY]);
      const stroke = getStroke(currentPencilClientPoints.current, {
        size: 6,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });
      setPencilPreviewSvgPath(getSvgPathFromStroke(stroke));
    } else if ((activeTool === "box" || activeTool === "circle") && boxDragStartRef.current) {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const currentClientX = e.clientX - (containerRect?.left ?? 0);
      const currentClientY = e.clientY - (containerRect?.top ?? 0);
      const startClient = boxDragStartRef.current.client;

      const x = Math.min(startClient.x, currentClientX);
      const y = Math.min(startClient.y, currentClientY);
      const w = Math.abs(currentClientX - startClient.x);
      const h = Math.abs(currentClientY - startClient.y);
      setBoxPreviewRect({ x, y, w, h });
    }
  };

  // Pointer Up (Finalize Box/Circle Drag OR Pencil drawing)
  const handlePointerUp = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}

    if (activeTool === "pencil" && isDrawingPencil.current) {
      isDrawingPencil.current = false;
      setPencilPreviewSvgPath(null);
      const rawPoints = [...currentPencilFlowPoints.current];
      currentPencilFlowPoints.current = [];
      currentPencilClientPoints.current = [];

      if (rawPoints.length > 1) {
        const finalId = `pencil-${Date.now()}`;
        const xs = rawPoints.map((p) => p.x);
        const ys = rawPoints.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);

        const currentNodes = useFlowCanvasStore.getState().nodes;
        const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);

        const newPencilNode: Node = {
          id: finalId,
          type: "pencil",
          position: { x: minX, y: minY },
          style: { zIndex: nextZ },
          data: { points: rawPoints, color: "#ef4444", size: 6 },
        };
        setNodes((nds) => [...nds, newPencilNode]);
      }
      selectTool("select");
    } else if ((activeTool === "box" || activeTool === "circle") && boxDragStartRef.current) {
      const currentFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const startFlow = boxDragStartRef.current.flow;
      boxDragStartRef.current = null;
      setBoxPreviewRect(null);

      const dx = Math.abs(currentFlow.x - startFlow.x);
      const dy = Math.abs(currentFlow.y - startFlow.y);

      if (activeTool === "circle") {
        if (dx < 6 && dy < 6) {
          // Single click fallback: spawn default size circle centered at click
          handleCreateCircleAt(startFlow.x - 80, startFlow.y - 80, 160, 160);
        } else {
          const x = Math.min(startFlow.x, currentFlow.x);
          const y = Math.min(startFlow.y, currentFlow.y);
          const w = Math.max(80, dx);
          const h = Math.max(80, dy);
          handleCreateCircleAt(x, y, w, h);
        }
      } else {
        if (dx < 6 && dy < 6) {
          // Single click fallback: spawn default size box centered at click
          handleCreateBoxAt(startFlow.x - 110, startFlow.y - 70, 220, 140);
        } else {
          const x = Math.min(startFlow.x, currentFlow.x);
          const y = Math.min(startFlow.y, currentFlow.y);
          const w = Math.max(60, dx);
          const h = Math.max(40, dy);
          handleCreateBoxAt(x, y, w, h);
        }
      }
      selectTool("select");
    }
  };


  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden bg-zinc-50 dark:bg-zinc-950 ${
        activeTool !== "select"
          ? "[&_.react-flow__node]:!cursor-crosshair cursor-crosshair select-none"
          : "cursor-default"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Vertical Icon-Only Toolbar on the Right (capsule pill, moves with Copilot drawer) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 p-1.5 rounded-full glass-panel shadow-2xl backdrop-blur-2xl backdrop-saturate-150 transition-all duration-200 select-none border border-white/60 dark:border-white/10"
        style={{
          right: "var(--tools-bar-right, 18px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Select Tool */}
        <button
          type="button"
          onClick={() => selectTool("select")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "select"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md shadow-black/20 ring-1 ring-white/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 active:scale-95"
          }`}
          title="Select / Move Tool (V)"
        >
          <Pointer className="size-5" />
        </button>

        {/* Subtle separator */}
        <div className="w-5 h-[1px] bg-black/[0.08] dark:bg-white/[0.12] my-0.5 rounded-full" />

        {/* 2. Task Card Tool */}
        <button
          type="button"
          onClick={() => {
            if (activeTool === "task") {
              handleCreateTask();
            } else {
              selectTool("task");
            }
          }}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "task"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 active:scale-95"
          }`}
          title="Task Card Tool (N) — Click canvas to place, or click again to spawn at center"
        >
          <CheckSquare className="size-5" />
        </button>

        {/* 3. 2D Sketch Box Tool (Square) */}
        <button
          type="button"
          onClick={() => selectTool("box")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "box"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 active:scale-95"
          }`}
          title="Sketch Box Tool (B) — Drag to size"
        >
          <Square className="size-5" />
        </button>

        {/* Circle Sketch Tool */}
        <button
          type="button"
          onClick={() => selectTool("circle")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "circle"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 active:scale-95"
          }`}
          title="Sketch Circle Tool (O) — Drag to size"
        >
          <Circle className="size-5" />
        </button>

        {/* 4. Text Tool */}
        <button
          type="button"
          onClick={() => {
            if (activeTool === "text") {
              const center = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              });
              handleCreateTextAt(center);
            } else {
              selectTool("text");
            }
          }}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "text"
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 active:scale-95"
          }`}
          title="Text Note Tool (T) — Click canvas to place, or click again to spawn at center"
        >
          <TypeIcon className="size-5" />
        </button>

        {/* 5. Paper Sticky Note Tool */}
        <button
          type="button"
          onClick={() => {
            if (activeTool === "note") {
              const center = screenToFlowPosition({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2,
              });
              handleCreateNoteAt(center);
            } else {
              selectTool("note");
            }
          }}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "note"
              ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 active:scale-95"
          }`}
          title="Paper Sticky Note Tool (S) — Click canvas to place, or click again to spawn at center"
        >
          <StickyNote className="size-5" />
        </button>

        {/* 6. Semantic Arrow / Connector Tool */}
        <button
          type="button"
          onClick={() => selectTool("arrow")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "arrow"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 active:scale-95"
          }`}
          title="Semantic Arrow Tool (A) — Drag between node handles"
        >
          <MoveRight className="size-5" />
        </button>

        {/* 6. Freehand Pencil */}
        <button
          type="button"
          onClick={() => selectTool("pencil")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "pencil"
              ? "bg-rose-600 text-white shadow-md shadow-rose-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50/80 dark:hover:bg-rose-950/40 active:scale-95"
          }`}
          title="Freehand Pencil Tool (P) — Draw anywhere"
        >
          <Pencil className="size-5" />
        </button>
      </div>

      {/* Main React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={activeTool === "select"}
        elementsSelectable={activeTool === "select"}
        nodesConnectable={activeTool === "select" || activeTool === "arrow"}
        nodesFocusable={activeTool === "select"}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onEdgeClick={onEdgeClick}
        onDoubleClick={handlePaneDoubleClick}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        fitView
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={2.5}
        deleteKeyCode={null}
        multiSelectionKeyCode={MULTI_SELECTION_KEY_CODE}
        proOptions={PRO_OPTIONS}
        onlyRenderVisibleElements={true}
        selectionOnDrag={activeTool === "select"}
        panOnDrag={PAN_ON_DRAG}
        panOnScroll={true}
        panOnScrollSpeed={1.2}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnPinch={true}
        zoomOnScroll={false}
        zoomActivationKeyCode={ZOOM_ACTIVATION_KEY_CODE}
        panActivationKeyCode="Space"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.3}
          color="#94a3b8"
          className="opacity-45 dark:opacity-25"
        />
        <FlowZoomControls sidebarOpen={sidebarOpen} />
        <FlowShapeMenu selectedNode={selectedNode} />
      </ReactFlow>

      {/* Live Freehand Pencil Preview Overlay (Smooth 60fps) */}
      {pencilPreviewSvgPath && (
        <svg className="absolute inset-0 pointer-events-none z-40 w-full h-full overflow-visible">
          <path
            d={pencilPreviewSvgPath}
            fill="#ef4444"
            stroke="#ef4444"
            strokeWidth={0.5}
          />
        </svg>
      )}

      {/* Live Drag-to-size Box/Circle Preview Overlay */}
      {boxPreviewRect && (
        <div
          className={`absolute pointer-events-none border-2 border-dashed z-40 ${
            activeTool === "circle"
              ? "border-indigo-500 bg-indigo-500/10 rounded-full"
              : "border-emerald-500 bg-emerald-500/10 rounded-xl"
          }`}
          style={{
            left: boxPreviewRect.x,
            top: boxPreviewRect.y,
            width: boxPreviewRect.w,
            height: boxPreviewRect.h,
          }}
        />
      )}

      {/* Reparent Confirmation Modal */}
      <ReparentConfirmModal
        state={reparentState}
        onConfirm={handleConfirmReparent}
        onCancel={handleCancelReparent}
      />

      {/* In-Canvas Element AI Chat */}
      {inlineChatNodeId && (
        <ElementInlineChat
          nodeId={inlineChatNodeId}
          onClose={() => setInlineChatNodeId(null)}
        />
      )}
    </div>
  );
}
