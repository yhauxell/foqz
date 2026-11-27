import type { Edge, Node } from "@xyflow/react";
import { mindmapOf } from "@/lib/mindmap/mindmap";
import { childrenIndex } from "@/lib/mindmap/layout";

/**
 * "Tidy board": pure planning, no store. Everything on the board's top level is grouped
 * into rigid units (a region with its contents, a mind map, a set of connected elements,
 * or a single loose element), so tidying never rearranges the inside of a diagram.
 * It moves units, never resizes, deletes, or edits text or links.
 */

export interface TidyOptions {
  resolveOverlaps: boolean;
  groupLoose: boolean;
  foldMaps: boolean;
  packRegions: boolean;
}

export const DEFAULT_TIDY_OPTIONS: TidyOptions = {
  resolveOverlaps: true,
  groupLoose: true,
  foldMaps: false,
  packRegions: false,
};

export interface TidyPlan {
  /** Top-level node positions after tidying (only nodes that move). */
  moves: Map<string, { x: number; y: number }>;
  /** Loose clusters to wrap in a new region, as node ids. */
  groups: string[][];
  /** Map nodes to fold. */
  fold: string[];
  stats: { overlapping: number; moved: number; grouped: number; regions: number; mapsFolded: number; packed: number };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Unit extends Box {
  id: string;
  members: string[];
  kind: "region" | "map" | "diagram" | "loose";
  inScope: boolean;
}

const GAP = 32;
const GROUP_DISTANCE = 96;
const GRID = 8;

function size(n: Node) {
  return {
    w: Number(n.measured?.width ?? (n.style as any)?.width ?? n.width ?? (n.type === "projectFrame" ? 680 : 160)),
    h: Number(n.measured?.height ?? (n.style as any)?.height ?? n.height ?? (n.type === "projectFrame" ? 440 : 60)),
  };
}

function find(parent: Map<string, string>, x: string): string {
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r)!;
  let c = x;
  while (parent.get(c) !== r) {
    const next = parent.get(c)!;
    parent.set(c, r);
    c = next;
  }
  return r;
}

function union(parent: Map<string, string>, a: string, b: string) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra !== rb) parent.set(rb, ra);
}

/** Splits the top level into rigid units. */
export function buildUnits(nodes: Node[], edges: Edge[], selectedIds: string[] = [], fixedIds: string[] = []): Unit[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topOf = (n: Node): Node => {
    let cur = n;
    while (cur.parentId && byId.get(cur.parentId)) cur = byId.get(cur.parentId)!;
    return cur;
  };
  const top = nodes.filter((n) => !n.parentId);
  const parent = new Map(top.map((n) => [n.id, n.id]));
  for (const e of edges) {
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (a && b) union(parent, topOf(a).id, topOf(b).id);
  }
  for (const n of top) {
    const m = mindmapOf(n);
    if (m && parent.has(m.rootId)) union(parent, m.rootId, n.id);
  }

  const groups = new Map<string, Node[]>();
  for (const n of top) {
    const r = find(parent, n.id);
    groups.set(r, [...(groups.get(r) ?? []), n]);
  }
  const selectedTops = new Set(
    selectedIds.map((id) => byId.get(id)).filter(Boolean).map((n) => topOf(n!).id)
  );

  const units: Unit[] = [];
  for (const [id, members] of groups) {
    const visible = members.filter((m) => !m.hidden);
    const boxes = (visible.length ? visible : members).map((m) => ({ x: m.position.x, y: m.position.y, ...size(m) }));
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const kind: Unit["kind"] = members.some((m) => m.type === "projectFrame")
      ? "region"
      : members.some((m) => mindmapOf(m))
      ? "map"
      : members.length > 1
      ? "diagram"
      : "loose";
    units.push({
      id,
      members: members.map((m) => m.id),
      kind,
      x,
      y,
      w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
      h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
      inScope:
        (selectedTops.size === 0 || members.some((m) => selectedTops.has(m.id))) &&
        !members.some((m) => fixedIds.includes(m.id)),
    });
  }
  return units.sort((a, b) => a.y - b.y || a.x - b.x);
}

const overlaps = (a: Box, b: Box, gap = GAP) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export function countOverlapping(units: Box[]): number {
  const hit = new Set<number>();
  for (let i = 0; i < units.length; i++)
    for (let j = i + 1; j < units.length; j++)
      if (overlaps(units[i], units[j], 0)) {
        hit.add(i);
        hit.add(j);
      }
  return hit.size;
}

/** Pushes overlapping units apart along the shorter axis; units out of scope stay put. */
export function separate(units: Unit[]): void {
  for (let iter = 0; iter < 400; iter++) {
    let moved = false;
    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];
        if (!overlaps(a, b)) continue;
        // Move the one in scope that sits later in reading order; if neither can move, skip.
        const [still, mover] = b.inScope ? [a, b] : a.inScope ? [b, a] : [null, null];
        if (!still || !mover) continue;
        const pushRight = still.x + still.w + GAP - mover.x;
        const pushDown = still.y + still.h + GAP - mover.y;
        const pushLeft = mover.x + mover.w + GAP - still.x;
        const pushUp = mover.y + mover.h + GAP - still.y;
        const options = [
          { d: pushRight, dx: pushRight, dy: 0 },
          { d: pushDown, dx: 0, dy: pushDown },
          { d: pushLeft, dx: -pushLeft, dy: 0 },
          { d: pushUp, dx: 0, dy: -pushUp },
        ].filter((o) => o.d > 0);
        const best = options.sort((p, q) => p.d - q.d)[0];
        if (!best) continue;
        mover.x += best.dx;
        mover.y += best.dy;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Lays regions out in rows that keep their reading order. Never resizes them. */
export function packRegions(units: Unit[]): number {
  const regions = units.filter((u) => u.kind === "region" && u.inScope);
  if (regions.length < 2) return 0;
  const startX = Math.min(...regions.map((r) => r.x));
  const startY = Math.min(...regions.map((r) => r.y));
  const cols = Math.ceil(Math.sqrt(regions.length));
  let x = startX;
  let y = startY;
  let rowH = 0;
  regions.forEach((r, i) => {
    if (i > 0 && i % cols === 0) {
      x = startX;
      y += rowH + GAP * 2;
      rowH = 0;
    }
    r.x = x;
    r.y = y;
    x += r.w + GAP * 2;
    rowH = Math.max(rowH, r.h);
  });
  return regions.length;
}

/** Loose single elements close to each other, in clusters of 3 or more. */
export function looseClusters(units: Unit[]): Unit[][] {
  const loose = units.filter((u) => u.kind === "loose" && u.inScope);
  const parent = new Map(loose.map((u) => [u.id, u.id]));
  for (let i = 0; i < loose.length; i++)
    for (let j = i + 1; j < loose.length; j++)
      if (overlaps(loose[i], loose[j], GROUP_DISTANCE)) union(parent, loose[i].id, loose[j].id);
  const clusters = new Map<string, Unit[]>();
  for (const u of loose) {
    const r = find(parent, u.id);
    clusters.set(r, [...(clusters.get(r) ?? []), u]);
  }
  return [...clusters.values()].filter((c) => c.length >= 3);
}

/** `fixedIds`: units containing these never move (others move around them). */
export function planTidy(
  nodes: Node[],
  edges: Edge[],
  opts: TidyOptions,
  selectedIds: string[] = [],
  fixedIds: string[] = []
): TidyPlan {
  const units = buildUnits(nodes, edges, selectedIds, fixedIds);
  const start = new Map(units.map((u) => [u.id, { x: u.x, y: u.y }]));
  const overlapping = countOverlapping(units.filter((u) => u.inScope).length ? units : []);

  const packed = opts.packRegions ? packRegions(units) : 0;
  if (opts.resolveOverlaps || packed) separate(units);

  const moves = new Map<string, { x: number; y: number }>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let movedUnits = 0;
  for (const u of units) {
    const s = start.get(u.id)!;
    const dx = Math.round((u.x - s.x) / GRID) * GRID;
    const dy = Math.round((u.y - s.y) / GRID) * GRID;
    if (!dx && !dy) continue;
    movedUnits++;
    for (const id of u.members) {
      const n = byId.get(id)!;
      moves.set(id, { x: Math.round(n.position.x + dx), y: Math.round(n.position.y + dy) });
    }
    u.x = s.x + dx;
    u.y = s.y + dy;
  }

  const groups = opts.groupLoose ? looseClusters(units).map((c) => c.flatMap((u) => u.members)) : [];

  const fold: string[] = [];
  if (opts.foldMaps) {
    const scopeIds = new Set(units.filter((u) => u.inScope).flatMap((u) => u.members));
    const roots = nodes.filter((n) => mindmapOf(n)?.parentId === null && scopeIds.has(n.id));
    for (const root of roots) {
      const items = nodes
        .filter((n) => mindmapOf(n)?.rootId === root.id)
        .map((n) => ({ id: n.id, parentId: mindmapOf(n)!.parentId, order: mindmapOf(n)!.order, w: 0, h: 0 }));
      const kids = childrenIndex(items);
      for (const c of kids.get(root.id) ?? []) {
        if ((kids.get(c.id)?.length ?? 0) > 0 && !mindmapOf(byId.get(c.id))?.collapsed) fold.push(c.id);
      }
    }
  }

  return {
    moves,
    groups,
    fold,
    stats: {
      overlapping,
      moved: movedUnits,
      grouped: groups.reduce((s, g) => s + g.length, 0),
      regions: groups.length,
      mapsFolded: new Set(fold.map((id) => mindmapOf(byId.get(id))?.rootId)).size,
      packed,
    },
  };
}
