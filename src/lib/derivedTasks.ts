import type { Edge, Node } from "@xyflow/react";
import { useFlowCanvasStore } from "@/poc/store/flowCanvasStore";
import { convertTextStyle, isDone, nodeTitle } from "@/lib/nodePredicates";
import { isDependencyEdge } from "@/lib/edgeRelations";
import { childrenIndex } from "@/lib/mindmap/layout";
import { mindmapOf } from "@/lib/mindmap/mindmap";

/**
 * Tasks derived from diagram elements. The element keeps its look; a new task card is
 * created beside the diagram and remembers where it came from (`data.derivedFrom`).
 * The element shows a done/total badge, and the task links back to it.
 */

export type DeriveMode = "auto" | "checklist" | "perBranch";

const NOT_DERIVABLE = new Set(["focusTask", "projectFrame"]);
export const isDerivable = (n: Node | null | undefined) => !!n && !!n.type && !NOT_DERIVABLE.has(n.type);

const TYPE_LABEL: Record<string, string> = {
  box: "rectangle",
  circle: "circle",
  arrow: "arrow",
  pencil: "sketch",
  image: "image",
  linkCard: "link",
  note: "note",
  text: "text",
};

/** A readable title for any element, even an unlabeled shape. */
export function elementTitle(n: Node): string {
  const t = nodeTitle(n);
  if (t && t !== n.id) return t.replace(/[*_~`]|==(\{\w+\})?/g, "").trim() || t;
  return `Task from ${TYPE_LABEL[n.type ?? ""] ?? "element"}`;
}

function size(n: Node) {
  return {
    w: Number(n.measured?.width ?? (n.style as any)?.width ?? n.width ?? 160),
    h: Number(n.measured?.height ?? (n.style as any)?.height ?? n.height ?? 60),
  };
}

/**
 * The diagram an element belongs to: everything connected to it by lines (and its whole
 * mind map) in the same region. Tasks go beside the diagram, never inside it.
 */
function diagramOf(nodes: Node[], edges: Edge[], n: Node): { key: string; members: Node[] } {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const seen = new Set<string>([n.id]);
  const queue = [n.id];
  const parent = n.parentId ?? null;
  while (queue.length) {
    const id = queue.pop()!;
    const cur = byId.get(id);
    const m = mindmapOf(cur);
    const linked = [
      ...edges.filter((e) => e.source === id).map((e) => e.target),
      ...edges.filter((e) => e.target === id).map((e) => e.source),
      ...(m ? nodes.filter((x) => mindmapOf(x)?.rootId === m.rootId).map((x) => x.id) : []),
    ];
    for (const other of linked) {
      const o = byId.get(other);
      if (!o || seen.has(other) || (o.parentId ?? null) !== parent || o.type === "focusTask") continue;
      seen.add(other);
      queue.push(other);
    }
  }
  const members = [...seen].map((id) => byId.get(id)!).filter((x) => x && !x.hidden);
  const key = mindmapOf(n)?.rootId ?? [...seen].sort()[0];
  return { key, members };
}

const TASK_W = 280;
const TASK_H = 82;

/** First free slot in a column to the right of `right`, scanning down from `top`. */
function freeSlot(peers: { x: number; y: number; w: number; h: number }[], right: number, top: number) {
  const pad = 16;
  for (let col = 0; col < 6; col++) {
    const x = Math.round(right + 120 + col * (TASK_W + 40));
    for (let step = 0; step < 60; step++) {
      const y = Math.round(top + step * 24);
      const hit = peers.some((b) => x < b.x + b.w + pad && x + TASK_W + pad > b.x && y < b.y + b.h + pad && y + TASK_H + pad > b.y);
      if (!hit) return { x, y };
    }
  }
  return { x: Math.round(right + 120), y: Math.round(top) };
}

function mapChildren(nodes: Node[], id: string): Node[] {
  const m = mindmapOf(nodes.find((n) => n.id === id));
  if (!m) return [];
  const items = nodes
    .filter((n) => mindmapOf(n)?.rootId === m.rootId)
    .map((n) => ({ id: n.id, parentId: mindmapOf(n)!.parentId, order: mindmapOf(n)!.order, w: 0, h: 0 }));
  const ids = (childrenIndex(items).get(id) ?? []).map((i) => i.id);
  return ids.map((cid) => nodes.find((n) => n.id === cid)!).filter(Boolean);
}

function checklist(nodes: Node[], children: Node[]): string {
  return children.map((c) => `- [ ] ${elementTitle(c)}`).join("\n");
}

interface Draft {
  sourceId: string;
  title: string;
  notes: string;
}

function draftsFor(nodes: Node[], source: Node, mode: DeriveMode): Draft[] {
  const children = mapChildren(nodes, source.id);
  if (mode === "perBranch" && children.length) {
    return children.map((c) => ({
      sourceId: c.id,
      title: elementTitle(c),
      notes: checklist(nodes, mapChildren(nodes, c.id)),
    }));
  }
  return [{ sourceId: source.id, title: elementTitle(source), notes: children.length ? checklist(nodes, children) : "" }];
}

/**
 * Creates task cards for the selected elements (or `ids`). Dependencies the user drew
 * between the elements ("depends on" lines) carry over to the new tasks.
 */
export function deriveTasks(mode: DeriveMode = "auto", ids?: string[]): string[] {
  const store = useFlowCanvasStore.getState();
  const nodes = store.nodes;
  const sources = (ids ? nodes.filter((n) => ids.includes(n.id)) : nodes.filter((n) => n.selected)).filter(isDerivable);
  if (!sources.length) return [];

  // Selecting a map node and its children shouldn't make duplicates: keep the topmost.
  const selectedIds = new Set(sources.map((s) => s.id));
  const roots = sources.filter((s) => {
    let p = mindmapOf(s)?.parentId;
    while (p) {
      if (selectedIds.has(p) && mode !== "perBranch") return false;
      p = mindmapOf(nodes.find((n) => n.id === p))?.parentId ?? null;
    }
    return true;
  });

  const created: Node[] = [];
  for (const source of roots) {
    const group = diagramOf(nodes, store.edges, source);
    const right = Math.max(...group.members.map((m) => m.position.x + size(m).w));
    const top = Math.min(...group.members.map((m) => m.position.y));
    for (const d of draftsFor(nodes, source, mode)) {
      const peers = [...nodes, ...created]
        .filter((x) => (x.parentId ?? null) === (source.parentId ?? null) && !x.hidden && x.type !== "projectFrame")
        .map((x) => ({ x: x.position.x, y: x.position.y, ...size(x) }));
      const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const text: Node = {
        id,
        type: "text",
        parentId: source.parentId,
        position: freeSlot(peers, right, top),
        data: { text: d.notes ? `${d.title}\n${d.notes}` : d.title },
      };
      const card = convertTextStyle(text, "card");
      card.data = { ...card.data, derivedFrom: d.sourceId, derivedGroup: group.key };
      created.push(card);
    }
  }

  // "Depends on" between two elements → "depends on" between their tasks.
  const all = [...nodes, ...created];
  const latestTaskOf = (sourceId: string) =>
    [...all].reverse().find((n) => n.type === "focusTask" && (n.data as any)?.derivedFrom === sourceId);
  const newIds = new Set(created.map((c) => c.id));
  const edges: Edge[] = [];
  for (const e of store.edges) {
    if (!isDependencyEdge(e)) continue;
    const a = latestTaskOf(e.source);
    const b = latestTaskOf(e.target);
    if (!a || !b || (!newIds.has(a.id) && !newIds.has(b.id))) continue;
    if (store.edges.some((x) => x.source === a.id && x.target === b.id)) continue;
    edges.push({
      id: `e-derived-${a.id}-${b.id}`,
      type: "semantic",
      source: a.id,
      sourceHandle: "bottom",
      target: b.id,
      targetHandle: "top",
      data: { relation: "depends" },
    });
  }

  store.setNodes((ns) => [...ns, ...created]);
  if (edges.length) store.setEdges((es) => [...es, ...edges]);
  return created.map((c) => c.id);
}

export interface DerivedStats {
  total: number;
  done: number;
  firstOpenId: string | null;
}

/** Tasks derived from each element, keyed by element id. */
export function derivedStats(nodes: Node[]): Map<string, DerivedStats> {
  const out = new Map<string, DerivedStats>();
  for (const n of nodes) {
    const from = (n.data as any)?.derivedFrom;
    if (typeof from !== "string" || n.type !== "focusTask") continue;
    const s = out.get(from) ?? { total: 0, done: 0, firstOpenId: null };
    s.total += 1;
    if (isDone(n)) s.done += 1;
    else s.firstOpenId ??= n.id;
    out.set(from, s);
  }
  return out;
}

export function centerOn(id: string) {
  window.dispatchEvent(new CustomEvent("foqz:flow-center-on", { detail: { id } }));
}
