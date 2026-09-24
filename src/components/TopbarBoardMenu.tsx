import { memo, useCallback, useState } from "react";
import {
  type Editor,
  type TLPageId,
  exportAs,
  useValue,
} from "tldraw";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Edit2,
  FileCode,
  ImageIcon,
  Layers,
  Maximize2,
  MoreHorizontal,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TopbarBoardMenuProps {
  editor: Editor | null;
}

export const TopbarBoardMenu = memo(function TopbarBoardMenu({
  editor,
}: TopbarBoardMenuProps) {
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const currentPage = useValue(
    "currentPage",
    () => (editor ? editor.getCurrentPage() : null),
    [editor],
  );

  const pages = useValue(
    "pages",
    () => (editor ? editor.getPages() : []),
    [editor],
  );

  const canUndo = useValue(
    "canUndo",
    () => (editor ? editor.getCanUndo() : false),
    [editor],
  );

  const canRedo = useValue(
    "canRedo",
    () => (editor ? editor.getCanRedo() : false),
    [editor],
  );

  const selectedCount = useValue(
    "selectedCount",
    () => (editor ? editor.getSelectedShapeIds().length : 0),
    [editor],
  );

  const handleSwitchPage = useCallback(
    (pageId: TLPageId) => {
      if (!editor) return;
      editor.setCurrentPage(pageId);
      setPageMenuOpen(false);
    },
    [editor],
  );

  const handleCreatePage = useCallback(() => {
    if (!editor) return;
    const newName = `Board ${pages.length + 1}`;
    editor.createPage({ name: newName });
    // Switch to the newly created page
    const updatedPages = editor.getPages();
    const created = updatedPages.find((p) => p.name === newName);
    if (created) {
      editor.setCurrentPage(created.id);
    }
  }, [editor, pages.length]);

  const handleStartRename = useCallback(
    (pageId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingPageId(pageId);
      setEditingName(currentName);
    },
    [],
  );

  const handleSaveRename = useCallback(
    (pageId: TLPageId) => {
      if (!editor || !editingName.trim()) {
        setEditingPageId(null);
        return;
      }
      editor.renamePage(pageId, editingName.trim());
      setEditingPageId(null);
    },
    [editor, editingName],
  );

  const handleDuplicatePage = useCallback(
    (pageId: TLPageId, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editor) return;
      editor.duplicatePage(pageId);
    },
    [editor],
  );

  const handleDeletePage = useCallback(
    (pageId: TLPageId, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!editor || pages.length <= 1) return;
      editor.deletePage(pageId);
    },
    [editor, pages.length],
  );

  const handleExport = useCallback(
    async (format: "png" | "svg" | "json") => {
      if (!editor) return;
      const ids = editor.getCurrentPageShapeIdsSorted();
      if (ids.length === 0) {
        alert("This board has no shapes to export.");
        return;
      }
      setActionsMenuOpen(false);
      await exportAs(editor, ids, format);
    },
    [editor],
  );

  const handleClearBoard = useCallback(() => {
    if (!editor) return;
    const ids = editor.getCurrentPageShapeIdsSorted();
    if (ids.length === 0) return;
    if (window.confirm("Clear all shapes on this board?")) {
      editor.deleteShapes(ids);
      setActionsMenuOpen(false);
    }
  }, [editor]);

  if (!editor || !currentPage) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 1. Page / Board Selector Dropdown */}
      <Popover open={pageMenuOpen} onOpenChange={setPageMenuOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="h-7 px-2.5 rounded-full border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer max-w-[160px]"
              title="Switch or manage canvas boards"
            />
          }
        >
          <Layers className="size-3.5 text-zinc-500 shrink-0" />
          <span className="truncate max-w-[90px]">
            {currentPage.name || "Ideas"}
          </span>
          <ChevronDown className="size-3 text-zinc-400 shrink-0" />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-56 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg rounded-xl text-zinc-900 dark:text-zinc-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-tight text-zinc-400 dark:text-zinc-500 uppercase">
            <span>Canvas Boards</span>
            <span>{pages.length}</span>
          </div>

          {/* Page List */}
          <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto py-1">
            {pages.map((page) => {
              const isActive = page.id === currentPage.id;
              const isRenaming = editingPageId === page.id;

              return (
                <div
                  key={page.id}
                  onClick={() => !isRenaming && handleSwitchPage(page.id)}
                  className={`group flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                    isActive
                      ? "bg-zinc-100 dark:bg-zinc-800/90 text-zinc-900 dark:text-white font-medium"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {isRenaming ? (
                    <div
                      className="flex items-center gap-1 w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(page.id);
                          if (e.key === "Escape") setEditingPageId(null);
                        }}
                        onBlur={() => handleSaveRename(page.id)}
                        className="w-full text-xs px-1.5 py-0.5 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded outline-none text-zinc-900 dark:text-zinc-100"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {isActive ? (
                          <Check className="size-3 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="size-3 shrink-0" />
                        )}
                        <span className="truncate">{page.name}</span>
                      </div>

                      {/* Hover action buttons */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          title="Rename board"
                          onClick={(e) => handleStartRename(page.id, page.name, e)}
                          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          <Edit2 className="size-2.5" />
                        </button>
                        <button
                          type="button"
                          title="Duplicate board"
                          onClick={(e) => handleDuplicatePage(page.id, e)}
                          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          <Copy className="size-2.5" />
                        </button>
                        {pages.length > 1 && (
                          <button
                            type="button"
                            title="Delete board"
                            onClick={(e) => handleDeletePage(page.id, e)}
                            className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-950/60 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="size-2.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* New Board Action */}
          <div className="pt-1 mt-1 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleCreatePage}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            >
              <Plus className="size-3.5 text-zinc-500" />
              <span>New Board</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* 2. Undo & Redo History Controls */}
      <div className="flex items-center gap-0.5 px-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={!canUndo}
          onClick={() => editor.undo()}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30"
          title="Undo (⌘Z)"
        >
          <Undo2 className="size-3.5" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={!canRedo}
          onClick={() => editor.redo()}
          className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30"
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="size-3.5" />
        </Button>
      </div>

      {/* 3. Selection Actions (shown when shapes are selected) */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-0.5 pl-1 border-l border-zinc-200 dark:border-zinc-800">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.duplicateShapes(editor.getSelectedShapeIds())}
            className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            title={`Duplicate ${selectedCount} shape${selectedCount > 1 ? "s" : ""} (⌘D)`}
          >
            <Copy className="size-3.5" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => editor.deleteShapes(editor.getSelectedShapeIds())}
            className="text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
            title={`Delete ${selectedCount} shape${selectedCount > 1 ? "s" : ""} (⌫)`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}

      {/* 4. Canvas Actions / More Menu (⋮) */}
      <Popover open={actionsMenuOpen} onOpenChange={setActionsMenuOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              title="Board actions & exports"
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-48 p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg rounded-xl text-zinc-900 dark:text-zinc-100"
        >
          {/* View controls */}
          <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight">
            View
          </div>
          <button
            type="button"
            onClick={() => {
              editor.zoomToFit({ animation: { duration: 200 } });
              setActionsMenuOpen(false);
            }}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2">
              <Maximize2 className="size-3 text-zinc-500" />
              <span>Zoom to Fit</span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">⇧1</span>
          </button>

          <button
            type="button"
            onClick={() => {
              editor.resetZoom();
              setActionsMenuOpen(false);
            }}
            className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <div className="flex items-center gap-2">
              <ZoomIn className="size-3 text-zinc-500" />
              <span>Zoom to 100%</span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">⇧0</span>
          </button>

          {/* Export section */}
          <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-tight border-t border-zinc-100 dark:border-zinc-800 mt-1">
            Export
          </div>
          <button
            type="button"
            onClick={() => handleExport("png")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <ImageIcon className="size-3 text-zinc-500" />
            <span>Export as PNG</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("svg")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <Download className="size-3 text-zinc-500" />
            <span>Export as SVG</span>
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
          >
            <FileCode className="size-3 text-zinc-500" />
            <span>Export as JSON</span>
          </button>

          {/* Destructive actions */}
          <div className="pt-1 mt-1 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={handleClearBoard}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors"
            >
              <Trash2 className="size-3 text-red-500" />
              <span>Clear Board</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
});
