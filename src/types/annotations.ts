/**
 * Canvas annotation / comment thread types.
 * Anchors can attach to a node (relative coords) or free-float on the canvas.
 */

export type AnnotationAuthor = "user" | "ai" | "system";

export type AnnotationKind = "comment" | "question" | "decision";

export type AnnotationStatus = "open" | "resolved";

export interface AnnotationAnchor {
  /** Target node id when pinned to an element; omit/null for free canvas notes. */
  nodeId?: string | null;
  /** Relative position within the target node (0..1). */
  rel?: { x: number; y: number };
  /** Absolute flow-space position for free-floating pins. */
  canvas?: { x: number; y: number };
}

export interface AnnotationMessage {
  id: string;
  author: AnnotationAuthor;
  body: string;
  createdAt: number;
  editedAt?: number;
}

export interface Annotation {
  id: string;
  anchor: AnnotationAnchor;
  kind: AnnotationKind;
  status: AnnotationStatus;
  /** When true, annotation body may be included in AI context. */
  aiVisible: boolean;
  createdAt: number;
  updatedAt: number;
  messages: AnnotationMessage[];
}
