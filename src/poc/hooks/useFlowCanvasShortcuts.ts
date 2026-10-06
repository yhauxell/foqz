import { useHotkeys } from "react-hotkeys-hook";

interface FlowCanvasShortcutsProps {
  enabled?: boolean;
  onSelectTool: () => void;
  onBoxTool: () => void;
  onCircleTool?: () => void;
  onTextTool: () => void;
  onNoteTool?: () => void;
  onArrowTool: () => void;
  onPencilTool: () => void;
  onCreateTask: () => void;
  onCreateProject: () => void;
  onFocusMode: () => void;
  onSendToRunway?: () => void;
  onCenterFront: () => void;
  onInlineChat?: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFitView: () => void;
  onGroupSelected?: () => void;
  onUngroupSelected?: () => void;
  onArrangeLayout?: () => void;
  onToggleShortcutsModal: () => void;
  onEscape: () => void;
}

export function useFlowCanvasShortcuts({
  enabled = true,
  onSelectTool,
  onBoxTool,
  onCircleTool,
  onTextTool,
  onNoteTool,
  onArrowTool,
  onPencilTool,
  onCreateTask,
  onCreateProject,
  onFocusMode,
  onSendToRunway,
  onCenterFront,
  onInlineChat,
  onDeleteSelected,
  onDuplicateSelected,
  onUndo,
  onRedo,
  onFitView,
  onGroupSelected,
  onUngroupSelected,
  onArrangeLayout,
  onToggleShortcutsModal,
  onEscape,
}: FlowCanvasShortcutsProps) {
  // Tools
  useHotkeys(["v", "1"], () => onSelectTool(), { preventDefault: true, enabled });
  useHotkeys(["b", "2"], () => onBoxTool(), { preventDefault: true, enabled });
  useHotkeys(["o"], () => onCircleTool?.(), { preventDefault: true, enabled });
  useHotkeys(["t", "3"], () => onTextTool(), { preventDefault: true, enabled });
  useHotkeys(["s", "S"], () => onNoteTool?.(), { preventDefault: true, enabled });
  useHotkeys(["a", "4"], () => onArrowTool(), { preventDefault: true, enabled });
  useHotkeys(["p", "5", "d"], () => onPencilTool(), { preventDefault: true, enabled });

  // Creation & Context Actions
  useHotkeys(["n", "N", "meta+n", "ctrl+n", "alt+n"], () => onCreateTask(), { preventDefault: true, enabled });
  useHotkeys(
    ["meta+shift+p", "ctrl+shift+p", "alt+p", "alt+meta+n", "alt+ctrl+n"],
    () => onCreateProject(),
    { preventDefault: true, enabled }
  );
  useHotkeys("f", () => onFocusMode(), { preventDefault: true, enabled });
  useHotkeys(["r", "R"], () => onSendToRunway?.(), { preventDefault: true, enabled });
  useHotkeys("shift+c", () => onCenterFront(), { preventDefault: true, enabled });
  useHotkeys("c", () => {
    if (onInlineChat) {
      onInlineChat();
    } else {
      onCenterFront();
    }
  }, { preventDefault: true, enabled });

  // Grouping & Layout
  useHotkeys(["ctrl+g", "meta+g"], () => onGroupSelected?.(), { preventDefault: true, enabled });
  useHotkeys(["ctrl+alt+g", "meta+alt+g", "meta+shift+g", "ctrl+shift+g"], () => onUngroupSelected?.(), { preventDefault: true, enabled });
  useHotkeys(["ctrl+shift+a", "meta+shift+a", "alt+shift+a"], () => onArrangeLayout?.(), { preventDefault: true, enabled });

  // Navigation & Actions
  useHotkeys(["delete", "backspace"], () => onDeleteSelected(), { preventDefault: true, enabled });
  useHotkeys(["meta+d", "ctrl+d"], () => onDuplicateSelected(), { preventDefault: true, enabled });
  useHotkeys(["meta+z", "ctrl+z"], () => onUndo?.(), { preventDefault: true, enabled });
  useHotkeys(["meta+shift+z", "ctrl+shift+z", "meta+y", "ctrl+y"], () => onRedo?.(), { preventDefault: true, enabled });
  useHotkeys("0", () => onFitView(), { preventDefault: true, enabled });
  useHotkeys(["?", "shift+?"], () => onToggleShortcutsModal(), { preventDefault: true, enabled });
  useHotkeys("escape", () => onEscape(), { preventDefault: true, enabled });
}


