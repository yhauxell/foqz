import { useHotkeys } from "react-hotkeys-hook";

interface FlowCanvasShortcutsProps {
  onSelectTool: () => void;
  onCreateBox: () => void;
  onCreateText: () => void;
  onPencilTool: () => void;
  onCreateTask: () => void;
  onCreateProject: () => void;
  onDeleteSelected: () => void;
  onFitView: () => void;
  onToggleShortcutsModal: () => void;
  onEscape: () => void;
}

export function useFlowCanvasShortcuts({
  onSelectTool,
  onCreateBox,
  onCreateText,
  onPencilTool,
  onCreateTask,
  onCreateProject,
  onDeleteSelected,
  onFitView,
  onToggleShortcutsModal,
  onEscape,
}: FlowCanvasShortcutsProps) {
  // Tools
  useHotkeys(["v", "1"], () => onSelectTool(), { preventDefault: true });
  useHotkeys(["b", "2"], () => onCreateBox(), { preventDefault: true });
  useHotkeys(["t", "3"], () => onCreateText(), { preventDefault: true });
  useHotkeys(["p", "4"], () => onPencilTool(), { preventDefault: true });

  // Create
  useHotkeys("n", () => onCreateTask(), { preventDefault: true });
  useHotkeys(["f", "shift+p"], () => onCreateProject(), { preventDefault: true });

  // Navigation & Actions
  useHotkeys(["delete", "backspace"], () => onDeleteSelected(), { preventDefault: true });
  useHotkeys("0", () => onFitView(), { preventDefault: true });
  useHotkeys(["?", "shift+?"], () => onToggleShortcutsModal(), { preventDefault: true });
  useHotkeys("escape", () => onEscape(), { preventDefault: true });
}
