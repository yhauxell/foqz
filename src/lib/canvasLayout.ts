import type { Node } from "@xyflow/react";

export interface NodeBounds {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getNodeDimensions(node: Node): { w: number; h: number } {
  const w = Number(
    node.measured?.width ??
      node.style?.width ??
      (node.width ??
        (node.type === "focusTask"
          ? 280
          : node.type === "box"
          ? 220
          : node.type === "circle"
          ? 160
          : node.type === "note"
          ? 240
          : node.type === "linkCard"
          ? 360
          : node.type === "projectFrame"
          ? 680
          : 200))
  );

  const h = Number(
    node.measured?.height ??
      node.style?.height ??
      (node.height ??
        (node.type === "focusTask"
          ? 82
          : node.type === "box"
          ? 140
          : node.type === "circle"
          ? 160
          : node.type === "note"
          ? 180
          : node.type === "linkCard"
          ? 240
          : node.type === "projectFrame"
          ? 440
          : 80))
  );

  return { w, h };
}

export function getNodeAbsolutePosition(node: Node, nodes: Node[]): { x: number; y: number } {
  let absX = node.position.x;
  let absY = node.position.y;
  let currentParentId = node.parentId;
  const visited = new Set<string>();

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = nodes.find((p) => p.id === currentParentId);
    if (!parent) break;
    absX += parent.position.x;
    absY += parent.position.y;
    currentParentId = parent.parentId;
  }

  return { x: absX, y: absY };
}

export function findAnnotationTargetAtFlowPos(
  flowPos: { x: number; y: number },
  nodes: Node[]
): {
  node: Node;
  absX: number;
  absY: number;
  width: number;
  height: number;
  rel: { x: number; y: number };
} | null {
  // Prefer inner cards/elements over container frames, and higher z-index / later DOM order first
  const candidateNodes = [...nodes].sort((a, b) => {
    const isFrameA = a.type === "projectFrame";
    const isFrameB = b.type === "projectFrame";
    if (isFrameA && !isFrameB) return 1;
    if (!isFrameA && isFrameB) return -1;
    const zA = Number(a.style?.zIndex ?? a.zIndex ?? 0);
    const zB = Number(b.style?.zIndex ?? b.zIndex ?? 0);
    return zB - zA;
  });

  for (const n of candidateNodes) {
    const { x: absX, y: absY } = getNodeAbsolutePosition(n, nodes);
    const { w: width, h: height } = getNodeDimensions(n);

    if (
      flowPos.x >= absX &&
      flowPos.x <= absX + width &&
      flowPos.y >= absY &&
      flowPos.y <= absY + height
    ) {
      const relX = Math.max(0, Math.min(1, (flowPos.x - absX) / (width || 1)));
      const relY = Math.max(0, Math.min(1, (flowPos.y - absY) / (height || 1)));
      return {
        node: n,
        absX,
        absY,
        width,
        height,
        rel: { x: relX, y: relY },
      };
    }
  }

  return null;
}

/**
 * Checks whether an element (with position and dimension) intersects with existing nodes.
 */
export function hasOverlap(
  candidate: { x: number; y: number; w: number; h: number },
  existing: NodeBounds[],
  padding = 24
): boolean {
  return existing.some(
    (b) =>
      candidate.x < b.x + b.w + padding &&
      candidate.x + candidate.w + padding > b.x &&
      candidate.y < b.y + b.h + padding &&
      candidate.y + candidate.h + padding > b.y
  );
}

/**
 * Finds the nearest non-overlapping position for a newly spawned item,
 * spiraling outward or walking down columns from preferred start coordinates.
 */
export function findNonOverlappingPosition(
  preferred: { x: number; y: number },
  size: { w: number; h: number },
  nodes: Node[],
  parentId?: string | null,
  containerBounds?: { minX: number; minY: number; maxX: number; maxY: number }
): { x: number; y: number } {
  // Collect peer nodes that share the same coordinate system (same parent)
  const peers = nodes.filter((n) => (n.parentId || null) === (parentId || null));
  const boundsList: NodeBounds[] = peers.map((p) => {
    const dim = getNodeDimensions(p);
    return {
      id: p.id,
      x: p.position.x,
      y: p.position.y,
      w: dim.w,
      h: dim.h,
    };
  });

  const cand = { x: preferred.x, y: preferred.y, w: size.w, h: size.h };
  if (!hasOverlap(cand, boundsList)) {
    return { x: preferred.x, y: preferred.y };
  }

  // If inside a project frame container: layout in a 2-column flow starting at y=80
  if (parentId) {
    const startX = 36;
    const startY = 80;
    const colWidth = size.w + 24;
    const rowHeight = size.h + 20;

    for (let row = 0; row < 50; row++) {
      for (let col = 0; col < 2; col++) {
        const testX = startX + col * colWidth;
        const testY = startY + row * rowHeight;
        const testCand = { x: testX, y: testY, w: size.w, h: size.h };
        if (!hasOverlap(testCand, boundsList, 16)) {
          return { x: testX, y: testY };
        }
      }
    }
  }

  // Canvas-level search: step outwards in an expanding radial / grid pattern
  const stepX = 60;
  const stepY = 50;
  const maxRadius = 12;

  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const testX = Math.round(preferred.x + dx * stepX);
        const testY = Math.round(preferred.y + dy * stepY);
        const testCand = { x: testX, y: testY, w: size.w, h: size.h };

        if (!hasOverlap(testCand, boundsList, 24)) {
          return { x: testX, y: testY };
        }
      }
    }
  }

  // Fallback offset
  return { x: preferred.x + 40, y: preferred.y + 40 };
}
