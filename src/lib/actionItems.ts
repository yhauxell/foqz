import type { Edge, Node } from "@xyflow/react";
import { edgeRelation } from "@/lib/edgeRelations";
import { elementTitle, isDerivable } from "@/lib/derivedTasks";
import { mindmapOf } from "@/lib/mindmap/mindmap";

/**
 * "Extract action items": the AI reads a diagram (elements, hierarchy, labels, connection
 * types) and proposes tasks. Nothing is created until the user confirms them in a review list.
 */

export interface ProposedItem {
  title: string;
  notes?: string;
  /** The element the item came from, when the AI named one that is in scope. */
  sourceId: string | null;
}

/** What the extraction reads: the selection, grown to whole maps and region contents. */
export function extractionScope(nodes: Node[], selectedIds: string[]): Node[] {
  const ids = new Set<string>();
  const add = (n: Node) => {
    if (n.type === "projectFrame") {
      for (const c of nodes) if (c.parentId === n.id) add(c);
      return;
    }
    const m = mindmapOf(n);
    if (m) for (const x of nodes) if (mindmapOf(x)?.rootId === m.rootId) ids.add(x.id);
    ids.add(n.id);
  };
  const selected = nodes.filter((n) => selectedIds.includes(n.id));
  for (const n of selected.length ? selected : nodes) add(n);
  return nodes.filter((n) => ids.has(n.id) && isDerivable(n) && n.type !== "pencil");
}

export function buildExtractionPrompt(scope: Node[], edges: Edge[]): string {
  const ids = new Set(scope.map((n) => n.id));
  const lines = scope.map((n) => {
    const m = mindmapOf(n);
    const d = (n.data || {}) as Record<string, any>;
    const body = typeof d.text === "string" ? d.text : typeof d.label === "string" ? d.label : "";
    const extra = body && body.trim() !== elementTitle(n) ? ` — ${body.replace(/\s+/g, " ").slice(0, 300)}` : "";
    const parent = m?.parentId ? ` (branch of ${m.parentId})` : m ? " (mind map topic)" : "";
    return `- [${n.id}] ${n.type}: "${elementTitle(n)}"${parent}${extra}`;
  });
  const links = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target) && !(e.data as any)?.mindmap)
    .map((e) => {
      const rel = edgeRelation(e);
      return rel === "depends"
        ? `- ${e.target} DEPENDS ON ${e.source}`
        : rel === "relates"
        ? `- ${e.source} relates to ${e.target}`
        : `- ${e.source} — ${e.target} (connected)`;
    });
  return [
    "Read this diagram and list the concrete action items it implies.",
    "",
    "Elements:",
    ...lines,
    ...(links.length ? ["", "Connections:", ...links] : []),
    "",
    'Reply with JSON only, no prose: {"items":[{"title":"Verb-first task, under 80 characters","notes":"optional detail","sourceId":"id of the element it comes from"}]}',
    "At most 12 items. Skip anything that is already a task or is not actionable.",
  ].join("\n");
}

export const EXTRACTION_SYSTEM_PROMPT =
  "You turn diagrams into a short list of concrete, verb-first action items. You answer with JSON only.";

/** Reads the model's answer; tolerant of code fences and prose around the JSON. */
export function parseActionItems(text: string, scopeIds: Set<string>): ProposedItem[] {
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1]);
  const obj = text.indexOf("{");
  if (obj >= 0) candidates.push(text.slice(obj, text.lastIndexOf("}") + 1));
  const arr = text.indexOf("[");
  if (arr >= 0) candidates.push(text.slice(arr, text.lastIndexOf("]") + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : null;
      if (!list) continue;
      return list
        .map((it: any) => ({
          title: String(it?.title ?? it?.task ?? "").trim().slice(0, 160),
          notes: typeof it?.notes === "string" && it.notes.trim() ? it.notes.trim() : undefined,
          sourceId: typeof it?.sourceId === "string" && scopeIds.has(it.sourceId) ? it.sourceId : null,
        }))
        .filter((it: ProposedItem) => it.title)
        .slice(0, 12);
    } catch {
      /* try the next candidate */
    }
  }
  return [];
}
