/**
 * Connection semantics.
 *
 * - `plain`: just a line. No meaning, never a dependency. The default for new connections.
 * - `relates`: a soft "relates to" link.
 * - `depends`: target depends on source. Only these feed task blockers.
 *
 * Edges saved before `plain` existed have no relation (or "depends") and keep
 * reading as dependencies, so old boards behave exactly as before.
 */
export type EdgeRelation = "plain" | "relates" | "depends";

export const DEFAULT_NEW_EDGE_RELATION: EdgeRelation = "plain";

type EdgeLike = { data?: unknown } | null | undefined;

export function edgeRelation(edge: EdgeLike): EdgeRelation {
  const rel = (edge?.data as { relation?: unknown } | undefined)?.relation;
  if (rel === "plain" || rel === "relates") return rel;
  return "depends";
}

export function isDependencyEdge(edge: EdgeLike): boolean {
  return edgeRelation(edge) === "depends";
}
