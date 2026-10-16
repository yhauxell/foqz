/**
 * Content identity for a board, ignoring revision and updatedAt.
 * Length plus two FNV-1a passes keeps the autosave path from retaining
 * the full JSON while still skipping no-op writes.
 */
export function boardFingerprint(parts: {
  nodes: unknown;
  edges: unknown;
  annotations: unknown;
}): string {
  const json = JSON.stringify({
    nodes: parts.nodes,
    edges: parts.edges,
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
