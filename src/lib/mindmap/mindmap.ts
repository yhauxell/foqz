import type { Edge, Node } from "@xyflow/react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import {
  balancedSide,
  childrenIndex,
  descendantsOf,
  layoutMindmap,
  parseOutline,
  type MapItem,
  type MapSide,
} from "./layout";

/**
 * Mind maps are ordinary text nodes carrying `data.mindmap`. Branch lines are plain
 * connections owned by the map (`data.mindmap: true` on the edge) and are derived from
 * the tree, so only the nodes' `mindmap` data is ever edited directly.
 */
export interface MindmapData {
  rootId: string;
  parentId: string | null;
  order: number;
  side?: MapSide;
  collapsed?: boolean;
}

export const ROOT_FONT_SIZE = 22;
const MAP_EDGE_PREFIX = "mm:";

export function mindmapOf(node: Node | null | undefined): MindmapData | null {
  const m = (node?.data as any)?.mindmap;
  return m && typeof m.rootId === "string" ? (m as MindmapData) : null;
}

export const isMapNode = (n: Node | null | undefined) => mindmapOf(n) !== null;

function size(n: Node) {
  return {
    w: Number(n.measured?.width ?? (n.style as any)?.width ?? n.width ?? 120),
    h: Number(n.measured?.height ?? (n.style as any)?.height ?? n.height ?? 44),
  };
}

function itemsOf(nodes: Node[], rootId: string): MapItem[] {
  return nodes
    .filter((n) => mindmapOf(n)?.rootId === rootId)
    .map((n) => {
      const m = mindmapOf(n)!;
      return { id: n.id, parentId: m.parentId, order: m.order, side: m.side, collapsed: m.collapsed, ...size(n) };
    });
}

const store = () => useFlowCanvasStore.getState();
const newId = () => `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function patchMap(n: Node, patch: Partial<MindmapData>): Node {
  return { ...n, data: { ...n.data, mindmap: { ...mindmapOf(n)!, ...patch } } };
}

/** Renumbers a parent's children 0..n-1 in their current order. */
function renumber(nodes: Node[], rootId: string, parentId: string): Node[] {
  const kids = childrenIndex(itemsOf(nodes, rootId)).get(parentId) ?? [];
  const order = new Map(kids.map((k, i) => [k.id, i]));
  return nodes.map((n) => (order.has(n.id) && mindmapOf(n)!.order !== order.get(n.id) ? patchMap(n, { order: order.get(n.id)! }) : n));
}

function select(nodes: Node[], id: string): Node[] {
  return nodes.map((n) => (n.id === id ? { ...n, selected: true } : n.selected ? { ...n, selected: false } : n));
}

function newMapNode(parent: Node, m: MindmapData, text = "", edit = true): Node {
  const p = parent.position;
  const { w } = size(parent);
  const dir = m.side === "left" ? -1 : 1;
  return {
    id: newId(),
    type: "text",
    parentId: parent.parentId,
    position: { x: p.x + dir * (w + 64), y: p.y },
    style: { zIndex: Number((parent.style as any)?.zIndex ?? 100) },
    data: { text, ...(edit ? { isNew: true, autoEdit: true } : {}), mindmap: m },
  };
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * `M` on a text: a multi-line outline becomes a whole map; any other text becomes the
 * central topic. Returns the root id.
 */
export function makeMindmap(id: string): string | null {
  const s = store();
  const node = s.nodes.find((n) => n.id === id);
  if (!node || node.type !== "text" || isMapNode(node)) return null;
  const outline = parseOutline(String((node.data as any)?.text ?? ""));

  if (!outline) {
    s.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                fontSize: Math.max(Number((n.data as any)?.fontSize) || 16, ROOT_FONT_SIZE),
                mindmap: { rootId: id, parentId: null, order: 0 } satisfies MindmapData,
              },
            }
          : n
      )
    );
    return id;
  }

  // First line is the topic; deeper lines hang under the nearest shallower line.
  const [first, ...rest] = outline;
  const created: Node[] = [];
  const items: MapItem[] = [{ id, parentId: null, order: 0, w: 0, h: 0 }];
  const stack: { depth: number; node: Node }[] = [];
  const rootNode: Node = {
    ...node,
    data: {
      ...node.data,
      text: first.text,
      fontSize: Math.max(Number((node.data as any)?.fontSize) || 16, ROOT_FONT_SIZE),
      mindmap: { rootId: id, parentId: null, order: 0 } satisfies MindmapData,
    },
  };
  for (const line of rest) {
    while (stack.length && stack[stack.length - 1].depth >= line.depth) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : rootNode;
    const siblings = items.filter((i) => i.parentId === parent.id);
    const side = parent === rootNode ? balancedSide(items, id) : mindmapOf(parent)!.side;
    const m: MindmapData = { rootId: id, parentId: parent.id, order: siblings.length, side };
    const child = newMapNode(parent, m, line.text, false);
    created.push(child);
    items.push({ id: child.id, parentId: parent.id, order: m.order, side, w: 1, h: 1 });
    stack.push({ depth: line.depth, node: child });
  }
  s.setNodes((nodes) => [...nodes.map((n) => (n.id === id ? rootNode : n)), ...created]);
  return id;
}

/** New empty child of `id`, in edit mode. */
export function addChild(parentId: string): string | null {
  const s = store();
  const parent = s.nodes.find((n) => n.id === parentId);
  const pm = mindmapOf(parent);
  if (!parent || !pm) return null;
  const items = itemsOf(s.nodes, pm.rootId);
  const siblings = items.filter((i) => i.parentId === parentId);
  const side = pm.parentId === null ? balancedSide(items, pm.rootId) : pm.side;
  const child = newMapNode(parent, { rootId: pm.rootId, parentId, order: siblings.length, side });
  s.setNodes((nodes) =>
    select(
      [...nodes.map((n) => (n.id === parentId && pm.collapsed ? patchMap(n, { collapsed: false }) : n)), child],
      child.id
    )
  );
  return child.id;
}

/** New empty sibling right after `id` (a child, when `id` is the root). */
export function addSibling(id: string): string | null {
  const s = store();
  const node = s.nodes.find((n) => n.id === id);
  const m = mindmapOf(node);
  if (!node || !m) return null;
  if (m.parentId === null) return addChild(id);
  const parent = s.nodes.find((n) => n.id === m.parentId);
  if (!parent) return null;
  const sib = newMapNode(node, { rootId: m.rootId, parentId: m.parentId, order: m.order + 0.5, side: m.side });
  s.setNodes((nodes) => select(renumber([...nodes, sib], m.rootId, m.parentId!), sib.id));
  return sib.id;
}

/** Moves `id` one level up, right after its old parent. */
export function outdent(id: string): boolean {
  const s = store();
  const node = s.nodes.find((n) => n.id === id);
  const m = mindmapOf(node);
  if (!m || m.parentId === null) return false;
  const parent = s.nodes.find((n) => n.id === m.parentId);
  const pm = mindmapOf(parent);
  if (!pm || pm.parentId === null) return false;
  const oldParent = m.parentId;
  s.setNodes((nodes) => {
    let next = nodes.map((n) => (n.id === id ? patchMap(n, { parentId: pm.parentId, order: pm.order + 0.5, side: pm.side }) : n));
    next = renumber(next, m.rootId, pm.parentId!);
    return renumber(next, m.rootId, oldParent);
  });
  return true;
}

/** Makes `id` a child of `newParentId` (same map, not its own descendant). */
export function reparent(id: string, newParentId: string, side?: MapSide): boolean {
  const s = store();
  const node = s.nodes.find((n) => n.id === id);
  const target = s.nodes.find((n) => n.id === newParentId);
  const m = mindmapOf(node);
  const tm = mindmapOf(target);
  if (!m || !tm || m.parentId === null || m.rootId !== tm.rootId || id === newParentId) return false;
  const items = itemsOf(s.nodes, m.rootId);
  if (descendantsOf(items, id).includes(newParentId)) return false;
  const oldParent = m.parentId;
  const siblings = items.filter((i) => i.parentId === newParentId);
  const nextSide = tm.parentId === null ? side ?? m.side ?? "right" : tm.side;
  const branch = new Set(descendantsOf(items, id));
  s.setNodes((nodes) => {
    let next = nodes.map((n) => {
      if (n.id === id) return patchMap(n, { parentId: newParentId, order: siblings.length, side: nextSide });
      if (branch.has(n.id)) return patchMap(n, { side: nextSide });
      if (n.id === newParentId && tm.collapsed) return patchMap(n, { collapsed: false });
      return n;
    });
    return renumber(next, m.rootId, oldParent);
  });
  return true;
}

export function toggleCollapse(id: string): boolean {
  const s = store();
  const node = s.nodes.find((n) => n.id === id);
  const m = mindmapOf(node);
  if (!m) return false;
  if (!m.collapsed && !(childrenIndex(itemsOf(s.nodes, m.rootId)).get(id)?.length)) return false;
  s.setNodes((nodes) => nodes.map((n) => (n.id === id ? patchMap(n, { collapsed: !m.collapsed }) : n)));
  return true;
}

export function hiddenCount(nodes: Node[], id: string): number {
  const m = mindmapOf(nodes.find((n) => n.id === id));
  if (!m?.collapsed) return 0;
  return descendantsOf(itemsOf(nodes, m.rootId), id).length;
}

/** Arrow-key navigation: the node to select next, or null. */
export function neighbor(id: string, key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): string | null {
  const nodes = store().nodes;
  const m = mindmapOf(nodes.find((n) => n.id === id));
  if (!m) return null;
  const items = itemsOf(nodes, m.rootId);
  const kids = childrenIndex(items);
  if (m.parentId === null) {
    if (m.collapsed || (key !== "ArrowLeft" && key !== "ArrowRight")) return null;
    const side: MapSide = key === "ArrowLeft" ? "left" : "right";
    return (kids.get(id) ?? []).find((c) => (c.side ?? "right") === side)?.id ?? null;
  }
  const outward = m.side === "left" ? "ArrowLeft" : "ArrowRight";
  const inward = m.side === "left" ? "ArrowRight" : "ArrowLeft";
  if (key === inward) return m.parentId;
  if (key === outward) return m.collapsed ? null : kids.get(id)?.[0]?.id ?? null;
  const siblings = (kids.get(m.parentId) ?? []).filter((c) => (c.side ?? "right") === (m.side ?? "right"));
  const i = siblings.findIndex((c) => c.id === id);
  const j = key === "ArrowUp" ? i - 1 : i + 1;
  return siblings[j]?.id ?? null;
}

export function selectOnly(id: string) {
  const s = store();
  s.setNodes((nodes) => select(nodes, id));
  s.setSelectedNodeId?.(id);
}

// ── Sync: positions, folding, branch lines ────────────────────────────────────

/** Everything layout depends on; positions of non-root nodes are deliberately left out. */
export function layoutSignature(nodes: Node[]): string {
  const parts: string[] = [];
  for (const n of nodes) {
    const m = mindmapOf(n);
    if (!m) continue;
    const { w, h } = size(n);
    parts.push(`${n.id}|${m.rootId}|${m.parentId}|${m.order}|${m.side}|${m.collapsed ? 1 : 0}|${Math.round(w)}x${Math.round(h)}|${n.parentId ?? ""}`);
    if (m.parentId === null) parts.push(`@${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)}`);
  }
  return parts.join(";");
}

/**
 * Brings every map in line with its tree: orphans re-attach to the root, children share the
 * root's region, positions follow the layout, folded branches hide, branch lines exist.
 * Returns null when nothing would change.
 */
export function syncMindmaps(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } | null {
  const ids = new Set(nodes.map((n) => n.id));
  const roots = new Map<string, Node>();
  for (const n of nodes) {
    const m = mindmapOf(n);
    if (m && m.parentId === null && m.rootId === n.id) roots.set(n.id, n);
  }

  let changed = false;
  // 1. Repair: map nodes whose root is gone become plain texts; whose parent is gone hang off the root.
  let next = nodes.map((n) => {
    const m = mindmapOf(n);
    if (!m || roots.has(n.id)) return n;
    const root = roots.get(m.rootId);
    if (!root) {
      changed = true;
      const data = { ...n.data };
      delete (data as any).mindmap;
      return { ...n, hidden: false, data };
    }
    let out = n;
    if (!m.parentId || !ids.has(m.parentId) || !mindmapOf(nodes.find((x) => x.id === m.parentId))) {
      changed = true;
      out = patchMap(out, { parentId: root.id, order: 1e6 });
    }
    if (out.parentId !== root.parentId) {
      changed = true;
      out = { ...out, parentId: root.parentId };
      if (!root.parentId) delete (out as any).parentId;
    }
    return out;
  });

  // 2. Layout each map.
  const targets = new Map<string, { x: number; y: number; hidden: boolean }>();
  for (const root of roots.values()) {
    const items = itemsOf(next, root.id);
    const { positions, hidden } = layoutMindmap(items, root.id, root.position);
    for (const it of items) {
      const p = positions.get(it.id);
      if (hidden.has(it.id) || !p) targets.set(it.id, { x: NaN, y: NaN, hidden: true });
      else targets.set(it.id, { x: p.x, y: p.y, hidden: false });
    }
  }
  next = next.map((n) => {
    const t = targets.get(n.id);
    if (!t || roots.has(n.id)) {
      if (t && Boolean(n.hidden) !== t.hidden) {
        changed = true;
        return { ...n, hidden: t.hidden };
      }
      return n;
    }
    if (t.hidden) {
      // Folded away: keep its last position, just hide it.
      if (n.hidden) return n;
      changed = true;
      return { ...n, hidden: true };
    }
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    if (Math.round(n.position.x) === x && Math.round(n.position.y) === y && Boolean(n.hidden) === t.hidden) return n;
    changed = true;
    return { ...n, position: { x, y }, hidden: t.hidden };
  });

  // 3. Branch lines. Any line touching a folded-away node hides with it.
  const hiddenIds = new Set(next.filter((n) => n.hidden).map((n) => n.id));
  const wanted = new Map<string, Edge>();
  for (const n of next) {
    const m = mindmapOf(n);
    if (!m?.parentId) continue;
    const left = m.side === "left";
    const id = `${MAP_EDGE_PREFIX}${m.parentId}->${n.id}`;
    wanted.set(id, {
      id,
      type: "semantic",
      source: m.parentId,
      sourceHandle: left ? "left" : "right",
      target: n.id,
      targetHandle: left ? "right" : "left",
      data: { relation: "plain", mindmap: true },
      hidden: hiddenIds.has(n.id) || hiddenIds.has(m.parentId),
    });
  }
  const kept: Edge[] = [];
  for (const e of edges) {
    if (!(e.data as any)?.mindmap) {
      const shouldHide = hiddenIds.has(e.source) || hiddenIds.has(e.target);
      if (Boolean(e.hidden) !== shouldHide && (shouldHide || (e.data as any)?.hiddenByMap)) {
        changed = true;
        kept.push({ ...e, hidden: shouldHide, data: { ...e.data, hiddenByMap: shouldHide || undefined } });
      } else kept.push(e);
      continue;
    }
    const w = wanted.get(e.id);
    if (!w) {
      changed = true;
      continue;
    }
    wanted.delete(e.id);
    if (e.sourceHandle !== w.sourceHandle || e.targetHandle !== w.targetHandle || Boolean(e.hidden) !== w.hidden) {
      changed = true;
      kept.push({ ...e, sourceHandle: w.sourceHandle, targetHandle: w.targetHandle, hidden: w.hidden });
    } else kept.push(e);
  }
  if (wanted.size) changed = true;
  return changed ? { nodes: next, edges: [...kept, ...wanted.values()] } : null;
}

/** Drop target for re-parenting: the map node under the dropped node's center, if any. */
export function dropTarget(dragged: Node, centerAbs: { x: number; y: number }, absOf: (n: Node) => { x: number; y: number; w: number; h: number }): Node | null {
  const m = mindmapOf(dragged);
  if (!m) return null;
  const nodes = store().nodes;
  const items = itemsOf(nodes, m.rootId);
  const branch = new Set([dragged.id, ...descendantsOf(items, dragged.id)]);
  return (
    nodes.find((n) => {
      if (branch.has(n.id) || n.hidden || mindmapOf(n)?.rootId !== m.rootId) return false;
      const b = absOf(n);
      return centerAbs.x >= b.x && centerAbs.x <= b.x + b.w && centerAbs.y >= b.y && centerAbs.y <= b.y + b.h;
    }) ?? null
  );
}
