import { useHotkeys } from "react-hotkeys-hook";

interface FlowCanvasShortcutsProps {
  enabled?: boolean;
  onSelectTool: () => void;
  onBoxTool: () => void;
  onCircleTool: () => void;
  onTextTool: () => void;
  onNoteTool: () => void;
  onConnectionTool: () => void;
  onArrowTool: () => void;
  onPencilTool: () => void;
  onCommentTool: () => void;
  onCreateText: () => void;
  onCreateProject: () => void;
  onToggleActionable: () => void;
  onFocusMode: () => void;
  onCenterFront: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onToggleShortcutsModal: () => void;
  onEscape: () => void;
}

/** Canvas shortcuts. Keep in sync with `src/poc/shortcuts/shortcutsConfig.ts`. */
export function useFlowCanvasShortcuts({
  enabled = true,
  onSelectTool,
  onBoxTool,
  onCircleTool,
  onTextTool,
  onNoteTool,
  onConnectionTool,
  onArrowTool,
  onPencilTool,
  onCommentTool,
  onCreateText,
  onCreateProject,
  onToggleActionable,
  onFocusMode,
  onCenterFront,
  onDeleteSelected,
  onDuplicateSelected,
  onUndo,
  onRedo,
  onFitView,
  onGroupSelected,
  onUngroupSelected,
  onToggleShortcutsModal,
  onEscape,
}: FlowCanvasShortcutsProps) {
  // Tools
  useHotkeys("v", () => onSelectTool(), { preventDefault: true, enabled });
  useHotkeys("r", () => onBoxTool(), { preventDefault: true, enabled });
  useHotkeys("o", () => onCircleTool(), { preventDefault: true, enabled });
  useHotkeys("t", () => onTextTool(), { preventDefault: true, enabled });
  useHotkeys("n", () => onNoteTool(), { preventDefault: true, enabled });
  useHotkeys("a", () => onArrowTool(), { preventDefault: true, enabled });
  useHotkeys("l", () => onConnectionTool(), { preventDefault: true, enabled });
  useHotkeys("p", () => onPencilTool(), { preventDefault: true, enabled });
  useHotkeys("c", () => onCommentTool(), { preventDefault: true, enabled });

  // Creation & behaviors
  useHotkeys(["meta+n", "ctrl+n"], () => onCreateText(), { preventDefault: true, enabled });
  useHotkeys(["meta+shift+p", "ctrl+shift+p"], () => onCreateProject(), { preventDefault: true, enabled });
  // Capture phase: React Flow treats Meta/Ctrl+Enter on a focused node as "multi-select toggle"
  // and would deselect it before this runs; stopping the event keeps the selection.
  useHotkeys(
    ["meta+enter", "ctrl+enter"],
    (e) => {
      e.stopPropagation();
      onToggleActionable();
    },
    { preventDefault: true, enabled, eventListenerOptions: { capture: true } }
  );
  useHotkeys("f", () => onFocusMode(), { preventDefault: true, enabled });
  useHotkeys("shift+c", () => onCenterFront(), { preventDefault: true, enabled });

  // Regions
  useHotkeys(["meta+g", "ctrl+g"], () => onGroupSelected(), { preventDefault: true, enabled });
  useHotkeys(["meta+shift+g", "ctrl+shift+g"], () => onUngroupSelected(), { preventDefault: true, enabled });

  // Navigation & editing
  useHotkeys(["delete", "backspace"], () => onDeleteSelected(), { preventDefault: true, enabled });
  useHotkeys(["meta+d", "ctrl+d"], () => onDuplicateSelected(), { preventDefault: true, enabled });
  useHotkeys(["meta+z", "ctrl+z"], () => onUndo(), { preventDefault: true, enabled });
  useHotkeys(["meta+shift+z", "ctrl+shift+z"], () => onRedo(), { preventDefault: true, enabled });
  useHotkeys("0", () => onFitView(), { preventDefault: true, enabled });
  useHotkeys(["?", "shift+?"], () => onToggleShortcutsModal(), { preventDefault: true, enabled });
  useHotkeys("escape", () => onEscape(), { preventDefault: true, enabled });
}
