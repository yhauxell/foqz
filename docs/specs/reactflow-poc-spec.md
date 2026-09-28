# Specification: Foqz React Flow Canvas Proof of Concept (PoC)

## 1. Overview & Objective
This specification outlines the technical design, architectural requirements, and validation gates for a Proof of Concept (PoC) migrating the canvas rendering engine in Foqz from `@tldraw/tldraw` to `@xyflow/react` (React Flow 12).

The primary goal of the PoC is to validate feasibility without destabilizing the current production application by running a side-by-side or toggled canvas implementation.

---

## 2. Core Validation Goals (PoC Scope)
The PoC must prove the following 5 critical capabilities:

1. **Custom Node Rendering & Theming**:
   - Render a high-fidelity `FocusTaskNode` matching the current aesthetic (P1-P4 priority styles, status toggles `open`/`doing`/`done`, markdown checklist support, paper themes).
   - Render a container `ProjectFrameNode` with custom title, goal, accent colors, and connector badges.
2. **Subflows & Hierarchical Containment (`parentId`)**:
   - Verify React Flow's native grouping/subflow model: tasks nested inside a project frame stay constrained (`extent: 'parent'` or coordinate relative) and move seamlessly with the parent frame.
3. **Viewport & Spatial Interactions**:
   - Smooth pan & zoom, coordinate transformations (`screenToFlowPosition`), and custom zoom controls (`+`, `-`, `100%`).
   - Virtualization verification (`onlyRenderVisibleElements`) under Electron to test CPU/GPU performance.
4. **Floating HUD & Action Overlay Positioning**:
   - Position floating contextual actions (HUD) and test inline interactions (chat trigger, mono-focus trigger) relative to the selected React Flow node.
5. **JSON State Serialization & Persistence**:
   - Save and restore node graph state (`{ nodes, edges, viewport }`) through Electron IPC (`snapshot:load` and `snapshot:save`).

---

## 3. Architecture & Component Design

```
src/poc/
├── FlowCanvasApp.tsx             # Root PoC canvas wrapper & ReactFlowProvider
├── FlowCanvas.tsx                # Inner ReactFlow component, hooks & handlers
├── nodes/
│   ├── FocusTaskNode.tsx         # Custom Task Card Node Component
│   ├── ProjectFrameNode.tsx      # Custom Group/Container Node Component
│   ├── FocusTimerNode.tsx        # Minimal timer node
│   └── index.ts                  # nodeTypes mapping
├── hooks/
│   ├── useFlowSelection.ts       # Track selected nodes & HUD screen coordinates
│   └── useFlowPersistence.ts     # Debounced persistence via window.focusStore
└── components/
    ├── FlowZoomControls.tsx      # Bottom-left zoom widget wired to useReactFlow
    └── FlowSelectionHud.tsx      # Floating contextual action bar tethered to selected node
```

### 3.1 Node Types & Schema

#### A. FocusTaskNode (`type: 'focusTask'`)
```typescript
export interface FocusTaskNodeData {
  title: string;
  status: 'open' | 'doing' | 'done';
  priority: 1 | 2 | 3 | 4; // 1=Urgent, 2=High, 3=Normal, 4=Low
  notes?: string;
  estimate?: string;
  paper?: 'cream' | 'fog' | 'bloom' | 'sage';
  trackedMs?: number;
  starred?: boolean;
}

export type FocusTaskNodeType = Node<FocusTaskNodeData, 'focusTask'>;
```

#### B. ProjectFrameNode (`type: 'projectFrame'`)
```typescript
export interface ProjectFrameNodeData {
  title: string;
  goal: string;
  accent: 'blue' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'cyan' | 'orange' | 'zinc';
  connectors?: {
    githubRepo?: string;
    notionWorkspace?: string;
    sentryProject?: string;
  };
}

export type ProjectFrameNodeType = Node<ProjectFrameNodeData, 'projectFrame'>;
```

### 3.2 Subflow Nesting Mechanics
- When a task node is dropped or created inside a `ProjectFrameNode`:
  - `parentId` is assigned to the frame's `id`.
  - Node position becomes relative to parent frame coordinates `(0, 0)`.
  - Dragging the parent frame automatically moves all child nodes without manual child coordinate calculation.

---

## 4. Electron & Performance Constraints (Derived from Agent Skills)

Based on the audit of **`memory-leak-debugging`**, **`chrome-devtools`**, and **`vercel-react-best-practices`**:
1. **Memory Isolation**:
   - Ensure node components clean up any running intervals (e.g. countdown timers) upon unmount.
   - Avoid creating new inline function references in `nodeTypes` outside of `useMemo`.
2. **CSS Containment & GPU Acceleration**:
   - Each custom node container will apply `contain: layout style` to prevent DOM layout thrashing during pan/zoom.
3. **Selective Subscriptions**:
   - Use `useNodesData` or custom Zustand selectors rather than subscribing to the full `nodes` array in child components.

---

## 5. PoC Integration & Canvas Toggle Mechanism
To avoid breaking the current development workflow:
1. Add an environment variable or local toggle in `FocusCanvasApp.tsx`:
   - e.g. Settings toggle or query parameter (`?engine=flow` vs default `?engine=tldraw`).
2. When `engine === 'flow'`, render `<FlowCanvasApp />` within the existing app shell.
3. Use a separate snapshot storage key for the PoC (`poc-flow-snapshot.json` or wrapped structure) so existing `board-snapshot.json` is never corrupted during testing.

---

## 6. Implementation Deliverables & Milestones

| Step | Milestone | Verification Criterion |
|---|---|---|
| **1** | Package Installation | Install `@xyflow/react` and update dependencies. |
| **2** | Node Component Library | Implement `FocusTaskNode` and `ProjectFrameNode`. |
| **3** | Canvas Engine Shell | Implement `FlowCanvasApp` with Controls, Background, MiniMap. |
| **4** | Subflow / Containment | Validate parent-child dragging and relative bounds. |
| **5** | Selection HUD & Overlay | Position floating actions over selected node. |
| **6** | Persistence Bridge | Save/restore flow snapshots to Electron store. |
| **7** | Evaluation Report | Measure memory, bundle impact, and FPS metrics. |

---

## 7. Next Step
Proceed with **Step 1 (Package Installation)** and scaffolding the PoC directory on this branch (`feat/poc-reactflow-canvas`).
