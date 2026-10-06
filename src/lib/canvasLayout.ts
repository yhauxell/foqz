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
          : node.type === "runwayFrame"
          ? 480
          : 200))
  );

  const h = Number(
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
          : node.type === "runwayFrame"
          ? 600
          : 80))
  );

  return { w, h };
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

/**
 * Arranges and tidies up all elements on the canvas (or within selected clusters/containers)
 * to separate overlapping items and restore spatial clarity.
 */
export function arrangeLayout(nodes: Node[]): Node[] {
  // 1. Separate nodes by parent containers (frames vs top-level items)
  const parents = new Set(nodes.filter((n) => n.parentId).map((n) => n.parentId!));
  let modified = [...nodes];

  // A. Tidy items inside each project frame
  for (const parentId of parents) {
    const parentNode = modified.find((n) => n.id === parentId);
    if (!parentNode || parentNode.type === "runwayFrame") continue;

    const children = modified.filter((n) => n.parentId === parentId);
    if (children.length === 0) continue;

    const parentW = Number(parentNode.style?.width ?? parentNode.width ?? 680);
    const startX = 36;
    let currentY = 80;
    const colCount = parentW >= 920 ? 3 : parentW >= 620 ? 2 : 1;
    const colSpacing = 24;

    const positionedChildren: Node[] = [];
    const colHeights = new Array(colCount).fill(80);

    children.forEach((child, index) => {
      const dim = getNodeDimensions(child);
      const col = index % colCount;
      const x = startX + col * (dim.w + colSpacing);
      const y = colHeights[col];

      colHeights[col] += dim.h + 20;

      positionedChildren.push({
        ...child,
        position: { x, y },
      });
    });

    const maxChildY = Math.max(...colHeights);
    const neededH = Math.max(
      Number(parentNode.style?.height ?? parentNode.height ?? 440),
      maxChildY + 40
    );

    // Update parent frame height and children positions
    modified = modified.map((n) => {
      if (n.id === parentId) {
        return {
          ...n,
          style: { ...n.style, height: neededH },
          height: neededH,
        };
      }
      const childMatch = positionedChildren.find((c) => c.id === n.id);
      return childMatch || n;
    });
  }

  // B. Tidy top-level elements (root frames, unparented cards, notes)
  const topLevel = modified.filter((n) => !n.parentId);
  if (topLevel.length <= 1) return modified;

  // Simple separation pass: if two top-level items overlap, nudge the right/lower one
  const boundsMap = new Map<string, NodeBounds>();
  topLevel.forEach((n) => {
    const dim = getNodeDimensions(n);
    boundsMap.set(n.id, {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: dim.w,
      h: dim.h,
    });
  });

  const updatedTopLevel: Node[] = [];
  const placedBounds: NodeBounds[] = [];

  // Sort by visual reading order (y then x)
  const sortedTopLevel = [...topLevel].sort((a, b) => {
    if (Math.abs(a.position.y - b.position.y) > 40) {
      return a.position.y - b.position.y;
    }
    return a.position.x - b.position.x;
  });

  for (const item of sortedTopLevel) {
    const dim = getNodeDimensions(item);
    let posX = item.position.x;
    let posY = item.position.y;

    let overlap = true;
    let iterations = 0;

    while (overlap && iterations < 30) {
      iterations++;
      overlap = false;
      for (const placed of placedBounds) {
        if (
          posX < placed.x + placed.w + 32 &&
          posX + dim.w + 32 > placed.x &&
          posY < placed.y + placed.h + 32 &&
          posY + dim.h + 32 > placed.y
        ) {
          overlap = true;
          // Nudge item to the right of or below the collision
          if (posX + dim.w / 2 <= placed.x + placed.w / 2) {
            posY = placed.y + placed.h + 40;
          } else {
            posX = placed.x + placed.w + 40;
          }
          break;
        }
      }
    }

    const finalBounds = { id: item.id, x: posX, y: posY, w: dim.w, h: dim.h };
    placedBounds.push(finalBounds);
    updatedTopLevel.push({
      ...item,
      position: { x: posX, y: posY },
    });
  }

  return modified.map((n) => {
    const topMatch = updatedTopLevel.find((t) => t.id === n.id);
    return topMatch || n;
  });
}
