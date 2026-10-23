export interface LogbookDay {
  workdayId: string; // e.g. "2026-10-08"
  window: { startMin: number; endMin: number };
  sweptAt: number;
  entries: LogbookEntry[];
  summary?: string; // Optional local AI summary for the day
}

export interface LogbookEntry {
  id: string;
  title: string;
  notes?: string;
  completedAt: number;
  completedVia?: "manual" | "focus" | "agent" | "github";
  focusSecondsSpent?: number;
  projectId?: string;
  projectTitle?: string;
  githubRepo?: string;
  githubIssueNumber?: number;
  relations: {
    dependents: string[];     // live tasks that depend on this
    dependencies: string[];   // tasks this depended on
    edgeLinks: string[];      // node IDs linked via SemanticEdge
    parentTaskId?: string;    // subtask parent
  };
  lastPosition?: {
    x: number;
    y: number;
    parentId?: string;
  };
  /** The node as it was swept (style, text, GitHub link), so restore brings back the same thing. */
  node?: {
    type?: string;
    data?: Record<string, unknown>;
    style?: Record<string, unknown>;
  };
}
