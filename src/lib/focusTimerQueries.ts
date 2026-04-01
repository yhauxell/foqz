import type { Editor, TLPageId, TLShapeId } from "tldraw";
import { isTaskSessionActive } from "@/lib/focusTime";
import type { TLFocusTaskShape } from "@/shapes/focusTask/FocusTaskShapeUtil";
import type { TLFocusTimerShape } from "@/shapes/focusTimer/FocusTimerShapeUtil";

function walk(
  editor: Editor,
  parentId: TLPageId | TLShapeId,
  visit: (s: TLFocusTimerShape) => void,
) {
  for (const id of editor.getSortedChildIdsForParent(parentId)) {
    const s = editor.getShape(id);
    if (!s) continue;
    if (s.type === "focus-timer") visit(s as TLFocusTimerShape);
    walk(editor, id, visit);
  }
}

function walkTasks(
  editor: Editor,
  parentId: TLPageId | TLShapeId,
  visit: (s: TLFocusTaskShape) => void,
) {
  for (const id of editor.getSortedChildIdsForParent(parentId)) {
    const s = editor.getShape(id);
    if (!s) continue;
    if (s.type === "focus-task") visit(s as TLFocusTaskShape);
    walkTasks(editor, id, visit);
  }
}

/** First running `focus-timer` with `endAt` set (pages in order, depth-first). */
export function findRunningFocusTimer(
  editor: Editor,
): TLFocusTimerShape | null {
  for (const page of editor.getPages()) {
    let found: TLFocusTimerShape | null = null;
    walk(editor, page.id, (t) => {
      if (found) return;
      if (t.props.running && t.props.endAt) found = t;
    });
    if (found) return found;
  }
  return null;
}

export type ActiveFocusHud =
  | { kind: "timer"; shape: TLFocusTimerShape }
  | { kind: "task"; shape: TLFocusTaskShape };

/** Toolbar / tray: prefer canvas timer if running, else in-card task session. */
export function findActiveFocusHud(editor: Editor): ActiveFocusHud | null {
  const timer = findRunningFocusTimer(editor);
  if (timer) return { kind: "timer", shape: timer };
  for (const page of editor.getPages()) {
    let found: TLFocusTaskShape | null = null;
    walkTasks(editor, page.id, (t) => {
      if (found) return;
      if (isTaskSessionActive(t.props)) found = t;
    });
    if (found) return { kind: "task", shape: found };
  }
  return null;
}
