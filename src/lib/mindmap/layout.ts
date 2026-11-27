/**
 * Tidy-tree layout for mind maps. Pure: no React, no store.
 *
 * The root stays where it is. Its children fan out to the right or left (by `side`), and
 * every deeper level continues in its branch's direction. A parent is centered vertically
 * on the block of its children. Branches under a collapsed node are hidden.
 */

export type MapSide = "left" | "right";

export interface MapItem {
  id: string;
  parentId: string | null;
  order: number;
  side?: MapSide;
  w: number;
  h: number;
  collapsed?: boolean;
}

export interface MapLayout {
  positions: Map<string, { x: number; y: number }>;
  hidden: Set<string>;
}

export const H_GAP = 64;
export const V_GAP = 14;

export function childrenIndex(items: MapItem[]): Map<string, MapItem[]> {
  const byParent = new Map<string, MapItem[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    const list = byParent.get(it.parentId) ?? [];
    list.push(it);
    byParent.set(it.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return byParent;
}

export function layoutMindmap(items: MapItem[], rootId: string, rootPos: { x: number; y: number }): MapLayout {
  const byId = new Map(items.map((i) => [i.id, i]));
  const kids = childrenIndex(items);
  const positions = new Map<string, { x: number; y: number }>();
  const hidden = new Set<string>();
  const root = byId.get(rootId);
  if (!root) return { positions, hidden };

  const hideBelow = (id: string) => {
    for (const c of kids.get(id) ?? []) {
      hidden.add(c.id);
      hideBelow(c.id);
    }
  };

  const heightMemo = new Map<string, number>();
  const blockHeight = (list: MapItem[]) =>
    list.reduce((sum, c) => sum + subtreeHeight(c), 0) + Math.max(0, list.length - 1) * V_GAP;
  function subtreeHeight(n: MapItem): number {
    const cached = heightMemo.get(n.id);
    if (cached !== undefined) return cached;
    const list = n.collapsed ? [] : kids.get(n.id) ?? [];
    const h = list.length ? Math.max(n.h, blockHeight(list)) : n.h;
    heightMemo.set(n.id, h);
    return h;
  }

  /** Lays out `list` as a column whose vertical center is `centerY`, next to a parent edge at `edgeX`. */
  function placeColumn(list: MapItem[], edgeX: number, centerY: number, dir: 1 | -1) {
    let y = centerY - blockHeight(list) / 2;
    for (const c of list) {
      const sh = subtreeHeight(c);
      const x = dir === 1 ? edgeX + H_GAP : edgeX - H_GAP - c.w;
      const cy = y + sh / 2;
      positions.set(c.id, { x, y: cy - c.h / 2 });
      if (c.collapsed) hideBelow(c.id);
      else placeColumn(kids.get(c.id) ?? [], dir === 1 ? x + c.w : x, cy, dir);
      y += sh + V_GAP;
    }
  }

  positions.set(root.id, { ...rootPos });
  if (root.collapsed) {
    hideBelow(root.id);
    return { positions, hidden };
  }
  const rootChildren = kids.get(root.id) ?? [];
  const centerY = rootPos.y + root.h / 2;
  placeColumn(rootChildren.filter((c) => c.side !== "left"), rootPos.x + root.w, centerY, 1);
  placeColumn(rootChildren.filter((c) => c.side === "left"), rootPos.x, centerY, -1);
  return { positions, hidden };
}

/** Side for a new child of the root: whichever side has fewer nodes, right first. */
export function balancedSide(items: MapItem[], rootId: string): MapSide {
  const kids = childrenIndex(items);
  const count = (id: string): number => 1 + (kids.get(id) ?? []).reduce((s, c) => s + count(c.id), 0);
  let right = 0;
  let left = 0;
  for (const c of kids.get(rootId) ?? []) {
    if (c.side === "left") left += count(c.id);
    else right += count(c.id);
  }
  return left < right ? "left" : "right";
}

/** All descendants of `id` (not including it). */
export function descendantsOf(items: MapItem[], id: string): string[] {
  const kids = childrenIndex(items);
  const out: string[] = [];
  const walk = (p: string) => {
    for (const c of kids.get(p) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

export interface OutlineLine {
  depth: number;
  text: string;
}

/**
 * Reads an indented list or markdown outline ("- a", "  - b", "# Title") into lines with
 * depths. Returns null when the text doesn't look like an outline (fewer than 2 lines).
 */
export function parseOutline(text: string): OutlineLine[] | null {
  const raw = text.split("\n").filter((l) => l.trim());
  if (raw.length < 2) return null;
  const lines = raw.map((l) => {
    const expanded = l.replace(/\t/g, "  ");
    const indent = expanded.match(/^ */)![0].length;
    const body = expanded
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")
      .trim();
    return { indent, body };
  });
  const indents = [...new Set(lines.map((l) => l.indent))].sort((a, b) => a - b);
  return lines.map((l) => ({ depth: indents.indexOf(l.indent), text: l.body }));
}
