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
import { ReminderBadges } from "./components/ReminderBadges";
import { useFlowCanvasShortcuts } from "./hooks/useFlowCanvasShortcuts";
import {
  Pointer,
  Square,
  Circle,
  Type as TypeIcon,
  MoveRight,
  Link2,
  Pencil,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { ElementInlineChat } from "@/components/ElementInlineChat";
import { AnnotationPinsOverlay } from "./components/AnnotationPinsOverlay";
import { AnnotationComposer } from "./components/AnnotationComposer";
import { AnnotationThread } from "./components/AnnotationThread";
import getStroke from "perfect-freehand";
import {
  useFlowCanvasStore,
  INITIAL_NODES,
  INITIAL_EDGES,
  getMaxZIndex,
  findFrameAt,
} from "./store/flowCanvasStore";
import { getCanvasStorage, nextBoardSnapshot } from "@/lib/storage";
import { isActionable, isTextNode, startFocus, stopFocus, toggleActionable } from "@/lib/nodeBehaviors";
import {
  findAnnotationTargetAtFlowPos,
  getNodeAbsolutePosition,
  getNodeDimensions,
} from "@/lib/canvasLayout";

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

export type ActiveTool = "select" | "box" | "circle" | "text" | "note" | "connection" | "arrow" | "pencil" | "comment";

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
  const activeBoardId = useFlowCanvasStore((s) => s.activeBoardId);
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

  const { screenToFlowPosition, fitView, getInternalNode, flowToScreenPosition } = useReactFlow();

  // In-Canvas Chat state
  const [inlineChatNodeId, setInlineChatNodeId] = useState<string | null>(null);

  // In-Canvas Annotation Composer & Thread State
  const [pendingComposer, setPendingComposer] = useState<{
    screenPos: { x: number; y: number };
    flowPos: { x: number; y: number };
    targetNodeId: string | null;
    targetTitle?: string;
    rel?: { x: number; y: number };
  } | null>(null);

  const annotations = useFlowCanvasStore((s) => s.annotations);
  const activeAnnotationId = useFlowCanvasStore((s) => s.activeAnnotationId);
  const setActiveAnnotationId = useFlowCanvasStore((s) => s.setActiveAnnotationId);
  const addAnnotation = useFlowCanvasStore((s) => s.addAnnotation);

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
      const focus = Boolean(e.detail?.focus);
      setTimeout(() => {
        const currentNodes = useFlowCanvasStore.getState().nodes;
        const targetNode = currentNodes.find((n) => n.id === id);
        const isProject = targetNode?.type === "projectFrame";
        if (focus) {
          // Focus in place: bring the node close, keep its neighborhood in view.
          fitView({ nodes: [{ id }], duration: 450, padding: 0.6, minZoom: 0.5, maxZoom: 1.6 });
        } else if (isProject) {
          fitView({
            nodes: [{ id }],
            duration: 400,
            padding: 0.12,
            minZoom: 0.6,
            maxZoom: 1.15,
          });
        } else if (fullSpace) {
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

    const handleOpenAnnotationComposer = (e: CustomEvent<{ nodeId: string }>) => {
      const nodeId = e.detail?.nodeId;
      if (!nodeId) return;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const targetNode = currentNodes.find((n) => n.id === nodeId);
      if (!targetNode) return;

      const internalNode = getInternalNode(targetNode.id);
      const absPos =
        internalNode?.internals?.positionAbsolute ?? getNodeAbsolutePosition(targetNode, currentNodes);
      const dims = getNodeDimensions(targetNode);
      const width = internalNode?.measured?.width ?? dims.w;
      const cornerFlow = { x: absPos.x + width, y: absPos.y };
      const screenPos = flowToScreenPosition(cornerFlow);
      const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      const title = (targetNode.data as any)?.title || (targetNode.data as any)?.label || (targetNode.data as any)?.text || targetNode.type;

      setPendingComposer({
        screenPos: { x: screenPos.x - containerRect.left, y: screenPos.y - containerRect.top },
        flowPos: cornerFlow,
        targetNodeId: targetNode.id,
        targetTitle: title,
        rel: { x: 0.95, y: 0.05 },
      });
    };

    const handleNewTask = (e: any) => {
      const title = e.detail?.title || "New Task";
      const notes = typeof e.detail?.notes === "string" ? e.detail.notes : "";
      const parentId =
        typeof e.detail?.parentId === "string" && e.detail.parentId
          ? e.detail.parentId
          : undefined;
      const relatedTaskIds: string[] = Array.isArray(e.detail?.relatedTaskIds)
        ? e.detail.relatedTaskIds.filter((x: unknown) => typeof x === "string")
        : [];
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      // When nesting into a region, let createTask place inside the frame.
      const pos = parentId
        ? e.detail?.position
        : e.detail?.position || useFlowCanvasStore.getState().cursorPosition || center;
      const store = useFlowCanvasStore.getState();
      const id = store.createTask({
        title,
        notes,
        status: "open",
        parentId,
        position: pos,
      });

      if (relatedTaskIds.length > 0) {
        const existingIds = new Set(store.nodes.map((n) => n.id));
        const now = Date.now();
        const citationEdges = relatedTaskIds
          .filter((targetId) => targetId !== id && existingIds.has(targetId))
          .map((targetId, idx) => ({
            id: `edge-cite-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            source: id,
            target: targetId,
            type: "semantic" as const,
            data: { relation: "depends" as const },
          }));
        if (citationEdges.length > 0) {
          useFlowCanvasStore.getState().setEdges((eds) => [...eds, ...citationEdges]);
        }
      }

      window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
      setActiveTool("select");
    };

    // Capture from the command bar: text lands where the user was.
    const handleNewText = (e: any) => {
      const text = typeof e.detail?.text === "string" ? e.detail.text : "";
      const center = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      const pos = e.detail?.position || useFlowCanvasStore.getState().cursorPosition || center;
      const id = useFlowCanvasStore.getState().createText({
        text,
        style: e.detail?.style,
        actionable: Boolean(e.detail?.actionable),
        position: pos,
        autoEdit: !text,
      });
      window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
      setActiveTool("select");
    };

    const handleNewProject = (e: any) => {
      const title = e.detail?.title || "New region";
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const frameWidth = Math.min(1080, Math.max(760, Math.round(viewportWidth * 0.65)));
      const frameHeight = Math.min(680, Math.max(480, Math.round(viewportHeight * 0.65)));
      const center = screenToFlowPosition({
        x: viewportWidth / 2,
        y: viewportHeight / 2,
      });
      const pos = e.detail?.position || {
        x: Math.round(center.x - frameWidth / 2),
        y: Math.round(center.y - frameHeight / 2),
      };

      const id = useFlowCanvasStore.getState().createProject({
        title,
        goal: "",
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
    window.addEventListener("foqz:new-text", handleNewText as EventListener);
    window.addEventListener("foqz:new-project", handleNewProject as EventListener);
    window.addEventListener(
      "foqz:open-annotation-composer",
      handleOpenAnnotationComposer as EventListener
    );
    return () => {
      window.removeEventListener("paste", handlePaste);
      window.removeEventListener("foqz:flow-center-on", handleCenterOn as EventListener);
      window.removeEventListener("foqz:flow-fit-view", handleFitView);
      window.removeEventListener("foqz:fit-view", handleFitView);
      window.removeEventListener("foqz:flow-zoom-fit", handleFitView);
      window.removeEventListener("foqz:flow-zoom-reset", handleZoomReset);
      window.removeEventListener("foqz:open-inline-chat", handleOpenInlineChat as EventListener);
      window.removeEventListener("foqz:new-task", handleNewTask as EventListener);
      window.removeEventListener("foqz:new-text", handleNewText as EventListener);
      window.removeEventListener("foqz:new-project", handleNewProject as EventListener);
      window.removeEventListener(
        "foqz:open-annotation-composer",
        handleOpenAnnotationComposer as EventListener
      );
    };
  }, [fitView, screenToFlowPosition, flowToScreenPosition, setNodes, setSelectedNodeId]);

  // 3. Debounced Auto-save through the canvas storage adapter
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const storage = getCanvasStorage();
        const previous = storage.loadBoardSync(activeBoardId);
        storage.saveBoardSync(
          activeBoardId,
          nextBoardSnapshot({
            nodes,
            edges,
            annotations,
            previous,
          })
        );
      } catch (err) {
        console.warn("Failed to save React Flow snapshot:", err);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [nodes, edges, annotations, activeBoardId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Measuring and selecting are not edits; keep them out of undo history so ⌘Z undoes what you changed.
      const notAnEdit = changes.every(
        (c) => c.type === "select" || (c.type === "dimensions" && !c.resizing && !c.setAttributes)
      );
      const history = useFlowCanvasStore.temporal.getState();
      const quiet = notAnEdit && history.isTracking;
      if (quiet) history.pause();
      setNodes((nds) => applyNodeChanges(changes, nds));
      if (quiet) history.resume();
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
      const history = useFlowCanvasStore.temporal.getState();
      const quiet = changes.every((c) => c.type === "select") && history.isTracking;
      if (quiet) history.pause();
      setEdges((eds) => applyEdgeChanges(changes, eds));
      if (quiet) history.resume();
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
      if (activeTool === "connection" || activeTool === "arrow") {
        setActiveTool("select");
      }
    },
    [setEdges, activeTool]
  );

  // Region membership follows the drop: dropping inside a region adopts the
  // node, dropping outside releases it. No confirmation; undo reverts it.
  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: Node) => {
      if (node.type === "projectFrame") return;

      const currentNodes = useFlowCanvasStore.getState().nodes;
      const frames = currentNodes.filter((n) => n.type === "projectFrame" && n.id !== node.id);
      const currentParent = frames.find((f) => f.id === node.parentId);

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

      // The innermost region containing the node's center wins.
      const targetFrame = [...frames].reverse().find((f) => {
        const { fx, fy, fw, fh } = getFrameMetrics(f);
        return nodeCenterX >= fx && nodeCenterX <= fx + fw && nodeCenterY >= fy && nodeCenterY <= fy + fh;
      });

      if (targetFrame && targetFrame.id === currentParent?.id) return;

      if (targetFrame) {
        const { fx, fy } = getFrameMetrics(targetFrame);
        setNodes((nds) => {
          const withoutNode = nds.filter((n) => n.id !== node.id);
          const adopted: Node = {
            ...node,
            parentId: targetFrame.id,
            position: { x: Math.round(absX - fx), y: Math.round(absY - fy) },
            selected: true,
          };
          delete (adopted as any).extent;
          const parentIdx = withoutNode.findIndex((n) => n.id === targetFrame.id);
          if (parentIdx === -1) return [...withoutNode, adopted];
          const result = [...withoutNode];
          result.splice(parentIdx + 1, 0, adopted);
          return result;
        });
        return;
      }

      if (currentParent) {
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== node.id) return n;
            const released: Node = { ...n, position: { x: Math.round(absX), y: Math.round(absY) } };
            delete released.parentId;
            delete (released as any).extent;
            return released;
          })
        );
      }
    },
    [getInternalNode, setNodes]
  );

  // Helper spawners
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
            label: "",
            color: "rgba(16, 185, 129, 0.08)",
            strokeColor: "#10b981",
            roughness: 1.8,
            borderStyle: "solid",
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
          type: "box",
          position: { x, y },
          style: { width: w, height: h, zIndex: nextZ },
          data: {
            label: "",
            color: "rgba(16, 185, 129, 0.08)",
            strokeColor: "#10b981",
            roughness: 1.8,
            borderStyle: "solid",
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

  const handleCreateArrowAt = useCallback(
    (pos: { x: number; y: number }, endDelta: { x: number; y: number } = { x: 220, y: 120 }) => {
      const id = `arrow-${Date.now()}`;
      const currentNodes = useFlowCanvasStore.getState().nodes;
      const nextZ = Math.max(100, getMaxZIndex(currentNodes) + 1);

      const w = Math.max(120, Math.abs(endDelta.x) + 40);
      const h = Math.max(80, Math.abs(endDelta.y) + 40);

      // Setup start and end points inside bounding box
      const startX = endDelta.x >= 0 ? 20 : w - 20;
      const startY = endDelta.y >= 0 ? h - 20 : 20;
      const endX = endDelta.x >= 0 ? w - 20 : 20;
      const endY = endDelta.y >= 0 ? 20 : h - 20;
      const controlX = Math.round((startX + endX) / 2 + (endDelta.y >= 0 ? -30 : 30));
      const controlY = Math.round((startY + endY) / 2 + (endDelta.x >= 0 ? -25 : 25));

      const newNode: Node = {
        id,
        type: "arrow",
        position: pos,
        style: { width: w, height: h, zIndex: nextZ },
        data: {
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          control: { x: controlX, y: controlY },
          spear: "end",
          color: "#6366f1",
          strokeColor: "#6366f1",
          borderStyle: "solid",
          roughness: 1.2,
        },
        selected: true,
      };

      setNodes((nds) => [
        ...nds.map((n) => (n.selected ? { ...n, selected: false } : n)),
        newNode,
      ]);
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

  const handleCreateText = useCallback(() => {
    const store = useFlowCanvasStore.getState();
    const spawnPos =
      store.cursorPosition ||
      screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    handleCreateTextAt(spawnPos);
  }, [screenToFlowPosition, handleCreateTextAt]);

  const handleDeleteSelected = useCallback(() => {
    const currentNodes = useFlowCanvasStore.getState().nodes;
    const currentEdges = useFlowCanvasStore.getState().edges;

    const selectedNodes = currentNodes.filter((n) => n.selected);
    const selectedEdges = currentEdges.filter((e) => e.selected);

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    // Regions release their children instead of deleting them (see deleteNodes).
    if (selectedNodes.length > 0) {
      useFlowCanvasStore.getState().deleteNodes(selectedNodes.map((n) => n.id));
    }
    if (selectedEdges.length > 0) {
      const edgeIds = new Set(selectedEdges.map((e) => e.id));
      setEdges((eds) => eds.filter((e) => !edgeIds.has(e.id)));
    }
  }, [setEdges]);

  const handleEscape = useCallback(() => {
    if (useFlowCanvasStore.getState().activeFocusNodeId) {
      stopFocus();
      return;
    }
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
        if (target.type === "projectFrame") {
          // Keep regions at base container level so their children stay above them
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

  // Unified Keyboard Shortcuts Hook
  useFlowCanvasShortcuts({
    onSelectTool: () => selectTool("select"),
    onBoxTool: () => selectTool("box"),
    onCircleTool: () => selectTool("circle"),
    onTextTool: () => selectTool("text"),
    onNoteTool: () => selectTool("note"),
    onConnectionTool: () => selectTool("connection"),
    onArrowTool: () => selectTool("arrow"),
    onPencilTool: () => selectTool("pencil"),
    onCommentTool: () => selectTool("comment"),
    onCreateText: handleCreateText,
    onCreateProject: handleCreateProject,
    onToggleActionable: () => {
      const sel = useFlowCanvasStore.getState().nodes.filter((n) => n.selected && isTextNode(n));
      sel.forEach((n) => toggleActionable(n.id));
    },
    onFocusMode: () => {
      const store = useFlowCanvasStore.getState();
      const currentNodes = store.nodes;
      const sel = currentNodes.find((n) => n.selected);
      const firstOpen = (candidates: Node[]) =>
        candidates
          .filter((n) => isActionable(n) && (n.data as any)?.status !== "done")
          .sort((a, b) => a.position.y - b.position.y)[0];

      let targetId: string | null = null;
      if (sel?.type === "projectFrame") {
        targetId = firstOpen(currentNodes.filter((n) => n.parentId === sel.id))?.id ?? null;
      } else if (sel && (isTextNode(sel) || isActionable(sel))) {
        targetId = sel.id;
      } else if (!sel) {
        targetId = firstOpen(currentNodes)?.id ?? null;
      }

      if (targetId) {
        startFocus(targetId);
      } else {
        fitView({ duration: 300 });
      }
    },
    onCenterFront: handleCenterFront,
    onDeleteSelected: handleDeleteSelected,
    onDuplicateSelected: () => useFlowCanvasStore.getState().duplicateSelected(),
    onGroupSelected: () => {
      const groupId = useFlowCanvasStore.getState().groupSelectedNodes();
      if (groupId) {
        window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id: groupId } }));
      }
    },
    onUngroupSelected: () => {
      useFlowCanvasStore.getState().ungroupSelectedNodes();
    },
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
      if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      if (activeTool === "text") {
        handleCreateTextAt(pos);
      } else if (activeTool === "note") {
        handleCreateNoteAt(pos);
      } else if (activeTool === "comment") {
        const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const currentNodes = useFlowCanvasStore.getState().nodes;
        const target = findAnnotationTargetAtFlowPos(pos, currentNodes);

        if (target) {
          const title =
            (target.node.data as any)?.title ||
            (target.node.data as any)?.label ||
            (target.node.data as any)?.text ||
            target.node.type;
          setPendingComposer({
            screenPos: { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top },
            flowPos: pos,
            targetNodeId: target.node.id,
            targetTitle: title,
            rel: target.rel,
          });
        } else {
          setPendingComposer({
            screenPos: { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top },
            flowPos: pos,
            targetNodeId: null,
            targetTitle: "Canvas",
          });
        }
        setActiveTool("select");
      } else {
        setEdges((eds) =>
          eds.some((e) => e.selected)
            ? eds.map((e) => (e.selected ? { ...e, selected: false } : e))
            : eds
        );
      }
    },
    [activeTool, screenToFlowPosition, handleCreateTextAt, handleCreateNoteAt, setEdges, setActiveTool]
  );

  // Node Click Handler (Places task/text/note/comment inside node if tool active, otherwise selects node)
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
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
      if (activeTool === "comment") {
        event.stopPropagation();
        const flowPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const currentNodes = useFlowCanvasStore.getState().nodes;
        const internalNode = getInternalNode(node.id);
        const absPos =
          internalNode?.internals?.positionAbsolute ?? getNodeAbsolutePosition(node, currentNodes);
        const dims = getNodeDimensions(node);
        const width = internalNode?.measured?.width ?? dims.w;
        const height = internalNode?.measured?.height ?? dims.h;

        const relX = Math.max(0.05, Math.min(0.95, (flowPos.x - absPos.x) / (width || 1)));
        const relY = Math.max(0.05, Math.min(0.95, (flowPos.y - absPos.y) / (height || 1)));

        const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        const title =
          (node.data as any)?.title ||
          (node.data as any)?.label ||
          (node.data as any)?.text ||
          node.type;

        setPendingComposer({
          screenPos: { x: event.clientX - containerRect.left, y: event.clientY - containerRect.top },
          flowPos,
          targetNodeId: node.id,
          targetTitle: title,
          rel: { x: relX, y: relY },
        });
        setActiveTool("select");
        return;
      }
      if (activeTool === "select") {
        setSelectedNodeId(node.id);
      }
    },
    [activeTool, screenToFlowPosition, getInternalNode, handleCreateTextAt, handleCreateNoteAt, setSelectedNodeId, setActiveTool]
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
    // Only tools that require drag-drawing (pencil, box, circle, arrow) need pointer capture.
    // Task, text, note, connection, and select tools must NOT capture pointer, ensuring click-to-place and node clicks work!
    if (activeTool !== "pencil" && activeTool !== "box" && activeTool !== "circle" && activeTool !== "arrow") return;
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
    } else if (activeTool === "box" || activeTool === "circle" || activeTool === "arrow") {
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
    } else if ((activeTool === "box" || activeTool === "circle" || activeTool === "arrow") && boxDragStartRef.current) {
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

  // Pointer Up (Finalize Box/Circle/Arrow Drag OR Pencil drawing)
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
    } else if ((activeTool === "box" || activeTool === "circle" || activeTool === "arrow") && boxDragStartRef.current) {
      const currentFlow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const startFlow = boxDragStartRef.current.flow;
      boxDragStartRef.current = null;
      setBoxPreviewRect(null);

      const dx = Math.abs(currentFlow.x - startFlow.x);
      const dy = Math.abs(currentFlow.y - startFlow.y);

      if (activeTool === "arrow") {
        if (dx < 10 && dy < 10) {
          // Single click fallback: spawn default arrow pointing forward right
          handleCreateArrowAt({ x: startFlow.x - 30, y: startFlow.y - 30 }, { x: 200, y: 100 });
        } else {
          const startX = Math.min(startFlow.x, currentFlow.x);
          const startY = Math.min(startFlow.y, currentFlow.y);
          const deltaX = currentFlow.x - startFlow.x;
          const deltaY = currentFlow.y - startFlow.y;
          handleCreateArrowAt({ x: startX, y: startY }, { x: deltaX, y: deltaY });
        }
      } else if (activeTool === "circle") {
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
        data-tool-rail
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

        {/* 3. 2D Sketch Box Tool (Square) */}
        <button
          type="button"
          onClick={() => selectTool("box")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "box"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/40 active:scale-95"
          }`}
          title="Sketch Rectangle Tool (R) — Drag to size"
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
          title="Text (T) — Click to write anywhere. Style it plain, sticky or card; ⌘↵ makes it a to-do"
        >
          <TypeIcon className="size-5" />
        </button>

        {/* 6. Semantic Connection / Wire Tool */}
        <button
          type="button"
          onClick={() => selectTool("connection")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "connection"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 active:scale-95"
          }`}
          title="Connection Tool (L) — Drag between node handles to create dependencies"
        >
          <Link2 className="size-5" />
        </button>

        {/* 7. Canvas Pointer Arrow Element Tool */}
        <button
          type="button"
          onClick={() => selectTool("arrow")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "arrow"
              ? "bg-violet-600 text-white shadow-md shadow-violet-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50/80 dark:hover:bg-violet-950/40 active:scale-95"
          }`}
          title="Arrow (A) — Drag to draw"
        >
          <MoveRight className="size-5" />
        </button>

        {/* 8. Freehand Pencil */}
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

        {/* Subtle separator */}
        <div className="w-5 h-[1px] bg-black/[0.08] dark:bg-white/[0.12] my-0.5 rounded-full" />

        {/* 9. Comment / Annotation Tool */}
        <button
          type="button"
          onClick={() => selectTool("comment")}
          className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            activeTool === "comment"
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/30 ring-1 ring-white/25"
              : "text-zinc-600 dark:text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50/80 dark:hover:bg-amber-950/40 active:scale-95"
          }`}
          title="Annotation & Comment Tool (C) — Pin feedback to elements or canvas"
        >
          <MessageSquare className="size-5" />
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
        nodesConnectable={activeTool === "select" || activeTool === "connection"}
        nodesFocusable={activeTool === "select"}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
        <ReminderBadges />
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

      {/* In-Canvas Element AI Chat */}
      {inlineChatNodeId && (
        <ElementInlineChat
          nodeId={inlineChatNodeId}
          onClose={() => setInlineChatNodeId(null)}
        />
      )}

      {/* Canvas Annotation Pins Overlay (Figma-style interactive pins) */}
      <AnnotationPinsOverlay
        visible={true}
        onSelectAnnotation={(id) => setActiveAnnotationId(id)}
      />

      {/* In-Canvas Annotation Composer Popover */}
      {pendingComposer && (
        <AnnotationComposer
          position={pendingComposer.screenPos}
          targetNodeId={pendingComposer.targetNodeId}
          targetTitle={pendingComposer.targetTitle}
          onSave={({ body, kind, aiVisible }) => {
            addAnnotation({
              anchor: {
                nodeId: pendingComposer.targetNodeId,
                rel: pendingComposer.rel,
                canvas: pendingComposer.targetNodeId ? undefined : pendingComposer.flowPos,
              },
              body,
              kind,
              aiVisible,
            });
            setPendingComposer(null);
          }}
          onCancel={() => setPendingComposer(null)}
        />
      )}

      {/* Active Annotation Thread Popover */}
      {activeAnnotationId && annotations[activeAnnotationId] && (
        <div
          className="fixed top-18 right-20 z-50 animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <AnnotationThread
            annotation={annotations[activeAnnotationId]}
            elementTitle={
              annotations[activeAnnotationId].anchor.nodeId
                ? (() => {
                    const n = nodes.find(
                      (item) => item.id === annotations[activeAnnotationId].anchor.nodeId
                    );
                    return (
                      (n?.data as any)?.title ||
                      (n?.data as any)?.label ||
                      (n?.data as any)?.text ||
                      n?.type
                    );
                  })()
                : 'Canvas'
            }
            onClose={() => setActiveAnnotationId(null)}
            onOpenInlineChat={(nodeId) => {
              setActiveAnnotationId(null);
              setInlineChatNodeId(nodeId || '__canvas__');
            }}
          />
        </div>
      )}
    </div>
  );
}
