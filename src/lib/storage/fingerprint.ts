/** React Flow chrome. It changes on select, drag, and measure without a user edit. */
const NODE_EPHEMERAL = new Set(["selected", "dragging", "resizing", "measured", "internals"]);
const EDGE_EPHEMERAL = new Set(["selected"]);

function withoutEphemeral(value: unknown, keys: Set<string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== "object") return item;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(item as Record<string, unknown>)) {
      if (keys.has(key)) continue;
      next[key] = entry;
    }
    return next;
  });
}

/** Drop selection and measurement fields before a snapshot is stored or compared. */
export function persistableNodes<T>(nodes: T[]): T[] {
  return withoutEphemeral(nodes, NODE_EPHEMERAL) as T[];
}

export function persistableEdges<T>(edges: T[]): T[] {
  return withoutEphemeral(edges, EDGE_EPHEMERAL) as T[];
}

/**
 * Content identity for a board, ignoring revision, updatedAt, and React Flow chrome.
 * Length plus two FNV-1a passes keeps the autosave path from retaining
 * the full JSON while still skipping no-op writes.
 */
export function boardFingerprint(parts: {
  nodes: unknown;
  edges: unknown;
  annotations: unknown;
}): string {
  const json = JSON.stringify({
    nodes: withoutEphemeral(parts.nodes, NODE_EPHEMERAL),
    edges: withoutEphemeral(parts.edges, EDGE_EPHEMERAL),
    annotations: parts.annotations,
  });
  return `${json.length.toString(16)}:${fnv(json, 0x811c9dc5).toString(16)}:${fnv(json, 0x811c9dc5 ^ json.length).toString(16)}`;
}

function fnv(json: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function snapshotByteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).length;
  }
  return json.length;
}
