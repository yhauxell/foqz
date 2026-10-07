import React, { useMemo } from 'react';
import { useReactFlow, type Node } from '@xyflow/react';
import {
  MessageSquare,
  HelpCircle,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import type { Annotation, AnnotationKind } from '@/types/annotations';
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
  constraint: {
    bg: 'bg-rose-500',
    text: 'text-white',
    ring: 'ring-rose-300',
  },
  todo: {
    bg: 'bg-blue-600',
    text: 'text-white',
    ring: 'ring-blue-300',
  },
};

export function AnnotationPinsOverlay({
  visible = true,
  onSelectAnnotation,
}: AnnotationPinsOverlayProps) {
  const { flowToScreenPosition } = useReactFlow();
  const nodes = useFlowCanvasStore((s) => s.nodes);
  const annotations = useFlowCanvasStore((s) => s.annotations);
  const activeAnnotationId = useFlowCanvasStore((s) => s.activeAnnotationId);

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

        // Resolve absolute position of node if nested inside a parent frame
        let absX = node.position.x;
        let absY = node.position.y;
        if (node.parentId) {
          const parent = nodes.find((p) => p.id === node.parentId);
          if (parent) {
            absX += parent.position.x;
            absY += parent.position.y;
          }
        }

        const width = Number(node.style?.width ?? node.width ?? 280);
        const height = Number(node.style?.height ?? node.height ?? 82);

        const relX = ann.anchor.rel?.x ?? 0.85;
        const relY = ann.anchor.rel?.y ?? 0.15;

        flowX = absX + width * relX;
        flowY = absY + height * relY;
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
  }, [visible, annotations, nodes, activeAnnotationId, flowToScreenPosition]);

  if (!visible || pins.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-35 overflow-hidden">
      {pins.map(({ annotation, screenPos, isActive }) => {
        const colors = KIND_COLORS[annotation.kind] || KIND_COLORS.comment;
        const rootMsg = annotation.messages[0];
        const preview = rootMsg ? rootMsg.body.slice(0, 32) : 'Annotation';
        const hasAiReply = annotation.messages.some((m) => m.author === 'ai');

        return (
          <div
            key={annotation.id}
            style={{
              position: 'absolute',
              left: `${screenPos.x}px`,
              top: `${screenPos.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
            className="pointer-events-auto transition-transform hover:scale-110 duration-150 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onSelectAnnotation(annotation.id);
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
