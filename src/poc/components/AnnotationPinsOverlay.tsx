import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useReactFlow, useViewport } from '@xyflow/react';
import {
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import type { Annotation, AnnotationKind } from '@/types/annotations';
import {
  findAnnotationTargetAtFlowPos,
  getNodeAbsolutePosition,
  getNodeDimensions,
} from '@/lib/canvasLayout';
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore';

interface AnnotationPinsOverlayProps {
  visible?: boolean;
  onSelectAnnotation: (id: string) => void;
  onOpenInlineChat?: (nodeId?: string) => void;
}

const KIND_COLORS: Record<AnnotationKind, { bg: string; text: string; ring: string }> = {
  comment: {
    bg: 'bg-zinc-800 dark:bg-zinc-200',
    text: 'text-white dark:text-zinc-900',
    ring: 'ring-zinc-400 dark:ring-zinc-600',
  },
  question: {
    bg: 'bg-amber-500',
    text: 'text-white',
    ring: 'ring-amber-300',
  },
  decision: {
    bg: 'bg-emerald-600',
    text: 'text-white',
    ring: 'ring-emerald-300',
  },
};

export function AnnotationPinsOverlay({
  visible = true,
  onSelectAnnotation,
}: AnnotationPinsOverlayProps) {
  const { flowToScreenPosition, screenToFlowPosition, getInternalNode } = useReactFlow();
  const viewport = useViewport();
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const annotations = useFlowCanvasStore((s) => s.annotations);
  const activeAnnotationId = useFlowCanvasStore((s) => s.activeAnnotationId);

  const overlayRef = useRef<HTMLDivElement>(null);
  const [, setRerender] = useState(0);

  useEffect(() => {
    // Ensure container rect is measured after mount and on window resize
    setRerender((r) => r + 1);
    const handleResize = () => setRerender((r) => r + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const overlayRect = overlayRef.current?.getBoundingClientRect();

  // Drag pin state
  const [dragPinState, setDragPinState] = useState<{
    id: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isDragging: boolean;
  } | null>(null);

  const dragPinRef = useRef(dragPinState);
  dragPinRef.current = dragPinState;

  useEffect(() => {
    if (!dragPinState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const cur = dragPinRef.current;
      if (!cur) return;
      const dist = Math.hypot(e.clientX - cur.startX, e.clientY - cur.startY);
      const isDragging = cur.isDragging || dist > 4;
      setDragPinState((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              isDragging,
            }
          : null
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      const cur = dragPinRef.current;
      if (!cur) return;

      if (cur.isDragging) {
        const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const currentNodes = useFlowCanvasStore.getState().nodes;
        const target = findAnnotationTargetAtFlowPos(flowPos, currentNodes);

        if (target) {
          useFlowCanvasStore.getState().moveAnnotationAnchor(cur.id, {
            nodeId: target.node.id,
            rel: target.rel,
          });
        } else {
          useFlowCanvasStore.getState().moveAnnotationAnchor(cur.id, {
            canvas: flowPos,
          });
        }
      } else {
        onSelectAnnotation(cur.id);
      }

      setDragPinState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [Boolean(dragPinState), screenToFlowPosition, onSelectAnnotation]);

  // Compute screen coordinates for each annotation pin
  const pins = useMemo(() => {
    if (!visible) return [];
    const list = Object.values(annotations);
    const result: Array<{
      annotation: Annotation;
      screenPos: { x: number; y: number };
      isActive: boolean;
    }> = [];

    for (const ann of list) {
      if (ann.status === 'resolved') continue; // only open pins on canvas overlay

      let flowX = 0;
      let flowY = 0;

      if (ann.anchor.nodeId) {
        const node = nodes.find((n) => n.id === ann.anchor.nodeId);
        if (!node) continue;

        const internalNode = getInternalNode(node.id);
        const absPos =
          internalNode?.internals?.positionAbsolute ?? getNodeAbsolutePosition(node, nodes);
        const dims = getNodeDimensions(node);
        const width = internalNode?.measured?.width ?? dims.w;
        const height = internalNode?.measured?.height ?? dims.h;

        const relX = ann.anchor.rel?.x ?? 0.85;
        const relY = ann.anchor.rel?.y ?? 0.15;

        flowX = absPos.x + width * relX;
        flowY = absPos.y + height * relY;
      } else if (ann.anchor.canvas) {
        flowX = ann.anchor.canvas.x;
        flowY = ann.anchor.canvas.y;
      } else {
        continue;
      }

      try {
        const screenPos = flowToScreenPosition({ x: flowX, y: flowY });
        result.push({
          annotation: ann,
          screenPos,
          isActive: ann.id === activeAnnotationId,
        });
      } catch {}
    }

    return result;
  }, [
    visible,
    annotations,
    nodes,
    activeAnnotationId,
    flowToScreenPosition,
    getInternalNode,
    viewport.x,
    viewport.y,
    viewport.zoom,
  ]);

  if (!visible) return null;

  return (
    <div ref={overlayRef} className="absolute inset-0 pointer-events-none z-35 overflow-hidden">
      {pins.map(({ annotation, screenPos, isActive }) => {
        const colors = KIND_COLORS[annotation.kind] || KIND_COLORS.comment;
        const hasAiReply = annotation.messages.some((m) => m.author === 'ai');
        const isCurrentDrag = dragPinState?.id === annotation.id && dragPinState.isDragging;

        const pinScreenX = isCurrentDrag ? dragPinState.currentX : screenPos.x;
        const pinScreenY = isCurrentDrag ? dragPinState.currentY : screenPos.y;

        const left = pinScreenX - (overlayRect?.left ?? 0);
        const top = pinScreenY - (overlayRect?.top ?? 0);

        return (
          <div
            key={annotation.id}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              transform: isCurrentDrag
                ? 'translate(-50%, -100%) scale(1.15)'
                : 'translate(-50%, -100%)',
              zIndex: isCurrentDrag ? 100 : undefined,
            }}
            className={`pointer-events-auto transition-transform ${
              isCurrentDrag
                ? 'cursor-grabbing select-none'
                : 'cursor-grab active:cursor-grabbing hover:scale-110 duration-150'
            }`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              setDragPinState({
                id: annotation.id,
                startX: e.clientX,
                startY: e.clientY,
                currentX: e.clientX,
                currentY: e.clientY,
                isDragging: false,
              });
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {/* Figma-style Pin Badge */}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-full shadow-lg ${
                colors.bg
              } ${colors.text} ${
                isActive ? `ring-2 ${colors.ring} scale-105` : 'hover:ring-1 hover:ring-white/40'
              } text-[11px] font-medium select-none`}
            >
              {hasAiReply ? (
                <Sparkles className="size-3 fill-current animate-pulse" />
              ) : (
                <MessageSquare className="size-3" />
              )}
              {annotation.messages.length > 1 && (
                <span className="font-bold text-[10px]">{annotation.messages.length}</span>
              )}
            </div>

            {/* Pointer notch */}
            <div
              className={`w-2 h-2 mx-auto rotate-45 -mt-1 shadow-xs ${colors.bg}`}
            />
          </div>
        );
      })}
    </div>
  );
}
