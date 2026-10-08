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
  priority?: 1 | 2 | 3 | 4;
  completedAt: number;
  completedVia?: "manual" | "focus" | "runway" | "agent" | "github";
  focusSecondsSpent?: number;
  projectId?: string;
  projectTitle?: string;
  runwayId?: string;
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
}
