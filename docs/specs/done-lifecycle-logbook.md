# Specification: Done Lifecycle & Modular Logbook

## 1. Overview & Motivation

In spatial visual productivity systems, the transition of a task from "in progress" to "done" presents a key tension:
1. **Immediate removal** disorients the user, destroys the satisfying visual momentum of completed work during the day, and breaks downstream spatial dependency graphs.
2. **Permanent canvas presence** clutters boards over weeks and months, degrading canvas performance and bloating LLM token context windows.

The **Done Lifecycle & Modular Logbook** solves this by establishing a clear temporal lifecycle:
- **D1. Daytime Canvas Retention**: Completed tasks remain visible in place on the spatial canvas during working hours.
- **D2. Automated Workday & Overnight Sweep**: At the end of the workday (`workingHours.endMin`), completed tasks are swept to the Logbook. Tasks completed after hours or late at night remain visible overnight and sweep the following morning at `workingHours.startMin`.
- **D3. Crash-Resistant Modular Storage**: Logbook entries are persisted in monthly JSON partitions (`logbook/YYYY-MM.json`) in the user data directory using atomic temp-write and file renaming.
- **D4. Downstream Dependency Stubs**: When a task is swept, any live downstream dependents retain a compact reference badge (`[📖 N]`) with the title and completion timestamp of their resolved prerequisites.
- **D5. Relation-Gated AI Context**: Completed logbook tasks do not pollute global prompt context; only completed predecessors directly connected to active canvas tasks are injected into AI planning prompts.
- **Focus Guardrails**: Sweeping is deferred automatically while a focus timer is running (`isTimerRunning` or `activeFocusNodeId`).
- **Instant Reversibility**: A floating HUD notification provides a 1-click Undo action to restore swept tasks back to their exact canvas positions.

---

## 2. Temporal Retention & Sweep Timing Logic

The sweep schedule is evaluated via `src/lib/logbookTiming.ts`:

### 2.1 Workday Boundaries
Working hours are configured in `AppSettings.workingHours` (default: 09:00 - 18:00, or `startMin: 540`, `endMin: 1080`).

### 2.2 Milestone Calculations
- **Daytime Completion** (`startMin <= completionMinute < endMin` on day $D$):
  - Retained in place during the workday.
  - Sweep milestone: $D$ at `endMin`.
- **After-Hours / Evening Completion** (`completionMinute >= endMin` on day $D$):
  - Retained in place overnight.
  - Sweep milestone: $D+1$ at `startMin`.
- **Pre-Dawn Completion** (`completionMinute < startMin` on day $D$):
  - Retained until the start of that day.
  - Sweep milestone: $D$ at `startMin`.

### 2.3 Offline Catch-Up
If the app was closed or suspended during a scheduled milestone, `useWorkdaySweepTicker` performs a catch-up sweep upon app launch/mount.

---

## 3. Storage Architecture & Schemas

### 3.1 File Hierarchy
Logbook files reside under the OS application support directory:
- macOS: `~/Library/Application Support/foqz/logbook/YYYY-MM.json`
- Windows: `%APPDATA%\foqz\logbook\YYYY-MM.json`
- Linux: `~/.config/foqz/logbook/YYYY-MM.json`

### 3.2 Partition Schema (`LogbookMonthFile`)
```typescript
export interface LogbookEntry {
  id: string;
  title: string;
  priority?: 1 | 2 | 3 | 4;
  completedAt: number;
  completedVia?: 'manual' | 'focus' | 'runway' | 'agent' | 'github';
  focusSecondsSpent?: number;
  originProjectId?: string;
  originProjectTitle?: string;
  notes?: string;
  originalPosition?: { x: number; y: number };
  originalParentId?: string;
}

export interface LogbookDay {
  workdayId: string; // e.g. "2026-10-19"
  window?: { startMin: number; endMin: number };
  entries: LogbookEntry[];
  summary?: string;
}
```

### 3.3 Atomic Writes (`electron/logbook.cjs`)
To eliminate the risk of corrupting monthly archives during sudden power loss or application shutdown, all disk writes write first to a `.tmp` file and rename atomically via `fs.renameSync`.

### 3.4 Universal Service (`src/lib/logbookService.ts`)
The renderer layer accesses logbook operations via a universal abstraction:
- When running under Electron: delegates directly to IPC channels (`logbook:append`, `logbook:listDays`, `logbook:getEntriesByIds`, `logbook:removeEntry`, `logbook:search`).
- When running in browser preview or headless Playwright test harnesses: falls back to structured `localStorage` with identical schema and full-text search capability.

---

## 4. Spatial Canvas UX & Interactions

### 4.1 Waypoint Rail Quick Access
The left dock ([`WaypointRail.tsx`](../../src/components/WaypointRail.tsx)) includes a dedicated amber `BookOpen` action button (`aria-label="Open Logbook"`) that opens the slide-out panel from anywhere on the canvas.

### 4.2 Logbook Drawer ([`LogbookDrawer.tsx`](../../src/components/LogbookDrawer.tsx))
The slide-out drawer provides:
- Month-by-month and day-by-day navigation sidebar with completion counters.
- Full-text search across titles and notes.
- Summary telemetry (total tasks completed, deep focus time logged).
- 1-click **"Restore to Canvas"**: reinstates the task node back to its original coordinate position or viewport center.

### 4.3 Swept Dependency Stubs ([`FocusTaskNode.tsx`](../../src/poc/nodes/FocusTaskNode.tsx))
When a task with outgoing dependency edges to live canvas tasks is swept:
1. Connected edges are cleanly removed from the graph.
2. The downstream task receives an entry in `resolvedDependencies: ResolvedDependencyStub[]`.
3. An amber `[📖 N]` pill appears on the task card (in both standard node view and flight strip view).
4. Clicking the pill renders a popover listing the completed prerequisite titles and timestamps.

### 4.4 Sweep Toast & 1-Click Undo ([`FocusCanvasApp.tsx`](../../src/FocusCanvasApp.tsx))
When a sweep occurs, a non-intrusive floating HUD toast appears:
- Informs the user of how many tasks were swept (`"N tasks swept to Logbook"`).
- Contains an **Undo** button (`RotateCcw`) that calls `restoreSweptTasks` to immediately return the tasks to the canvas.
- Automatically dismisses after 8 seconds or upon manual close (`X`).

---

## 5. Relation-Gated AI Context Expansion

Global history dumps degrade LLM reasoning and exhaust context tokens. [`src/lib/canvasContext.ts`](../../src/lib/canvasContext.ts) introduces **relation-gated expansion**:
- Unconnected swept tasks are excluded from LLM context prompts.
- When an active task has `resolvedDependencies` or live connected edges from completed predecessors, only those specific predecessor titles, notes, and completion statuses are included in the prompt context.
