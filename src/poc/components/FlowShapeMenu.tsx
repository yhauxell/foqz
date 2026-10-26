import React, { memo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import {
  useReactFlow,
  useStore,
  NodeToolbar,
  Position,
  type Node,
} from "@xyflow/react";
import {
  ALargeSmall,
  Bell,
  BellRing,
  Bold,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  Crosshair,
  Ellipsis,
  GitPullRequest,
  Highlighter,
  Italic,
  LayoutList,
  Link2,
  MessageSquarePlus,
  Minus,
  Plus,
  RemoveFormatting,
  Sparkles,
  StickyNote,
  Strikethrough,
  Trash2,
  Type as TypeIcon,
  Underline,
} from "lucide-react";
import { type ProjectAccent, type TaskPaperTheme } from "@/types/canvas";
import { useFlowCanvasStore } from "../store/flowCanvasStore";
import {
  isActionable,
  isTextNode,
  setTextStyle,
  textStyleOf,
  toggleActionable,
  type TextStyle,
} from "@/lib/nodeBehaviors";

import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  type TextFormatType,
  applyFormattingToString,
  applyFormattingToTextarea,
} from "../utils/textFormatting";
import { ReminderPanel } from "./ReminderPanel";
import { reminderOf } from "@/lib/reminders";

interface FlowShapeMenuProps {
  selectedNode: Node | null;
}

export const COLOR_PRESETS = [
  { name: "Blue",    hex: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)",  solidLight: "#eff6ff", solidDark: "#172554", accent: "blue",    paper: "fog"   },
  { name: "Emerald", hex: "#10b981", bg: "rgba(16, 185, 129, 0.12)",  solidLight: "#ecfdf5", solidDark: "#064e3b", accent: "emerald", paper: "sage"  },
  { name: "Amber",   hex: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)",  solidLight: "#fffbeb", solidDark: "#451a03", accent: "amber",   paper: "cream" },
  { name: "Rose",    hex: "#f43f5e", bg: "rgba(244, 63, 94, 0.12)",   solidLight: "#fff1f2", solidDark: "#4c0519", accent: "rose",    paper: "bloom" },
  { name: "Indigo",  hex: "#6366f1", bg: "rgba(99, 102, 241, 0.12)",  solidLight: "#eef2ff", solidDark: "#1e1b4b", accent: "indigo",  paper: "fog"   },
  { name: "Zinc",    hex: "#71717a", bg: "rgba(113, 113, 122, 0.12)", solidLight: "#f4f4f5", solidDark: "#27272a", accent: "zinc",    paper: "cream" },
  { name: "White",   hex: "#ffffff", bg: "rgba(255, 255, 255, 0.8)",  solidLight: "#ffffff", solidDark: "#18181b", accent: "zinc",    paper: "fog"   },
];

const BORDER_STYLES = [
  {
    id: "solid" as const,
    label: "Solid",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dashed" as const,
    label: "Dashed",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3.2 2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "dotted" as const,
    label: "Dotted",
    icon: (
      <svg className="size-3.5" viewBox="0 0 16 16" fill="none">
        <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="currentColor" strokeWidth="2.4" strokeDasharray="0.1 3.2" strokeLinecap="round" />
      </svg>
    ),
  },
];

const TEXT_STYLES: Array<{ id: TextStyle; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "plain", label: "Plain", hint: "Text on the canvas", icon: TypeIcon },
  { id: "sticky", label: "Sticky", hint: "On a sticky note", icon: StickyNote },
  { id: "card", label: "Card", hint: "On a card, always a to-do", icon: LayoutList },
];

/** Text size presets (FigJam / Miro style) instead of a pixel stepper. */
const TEXT_SIZES = [
  { label: "S", px: 13 },
  { label: "M", px: 16 },
  { label: "L", px: 22 },
  { label: "XL", px: 32 },
];

type MenuId = "style" | "size" | "color" | "border" | "spear" | "more" | "highlight" | "link" | "reminder";

function useOutsideClick(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as unknown as globalThis.Node)) onClose();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [ref, onClose]);
}

/** Icon button for the context toolbar. Keeps focus in the text while typing. */
function ToolButton({
  label,
  onClick,
  active,
  danger,
  pressed,
  children,
  className = "",
  ...rest
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`h-7 min-w-7 px-1.5 rounded-lg flex items-center justify-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : danger
          ? "text-zinc-600 dark:text-zinc-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60"
          : "text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-900 dark:hover:text-white"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-4 mx-0.5 bg-zinc-200 dark:bg-zinc-700/80" />;
}

/** Canvas area a floating element must stay inside: under the top bar, left of the tool rail. */
function canvasBounds() {
  const rail = document.querySelector("[data-tool-rail]")?.getBoundingClientRect();
  return { top: 56, left: 8, right: (rail && rail.width > 0 ? rail.left : window.innerWidth) - 8 };
}

/** Horizontal shift that keeps an element whose unshifted box is `r` inside the canvas. */
function horizontalFit(r: DOMRect) {
  const b = canvasBounds();
  let dx = 0;
  if (r.right > b.right) dx = b.right - r.right;
  if (r.left + dx < b.left) dx = b.left - r.left;
  return Math.round(dx);
}

/** Popover panel anchored above (or below) the toolbar; flips and slides to stay on the canvas. */
function Panel({ children, className = "", below }: { children: React.ReactNode; className?: string; below?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ dx: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured before any shift is applied; offsetWidth because the enter animation starts scaled down.
    const r = el.getBoundingClientRect();
    const center = (r.left + r.right) / 2;
    const half = el.offsetWidth / 2;
    setFit({
      dx: horizontalFit(new DOMRect(center - half, r.top, half * 2, r.height)),
      below: !!below || r.top < canvasBounds().top,
    });
  }, [below]);
  const openBelow = fit ? fit.below : below;
  return (
    <div
      ref={ref}
      className={`absolute left-1/2 -translate-x-1/2 ${openBelow ? "top-full mt-2" : "bottom-full mb-2"} z-50 p-1 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl animate-in fade-in zoom-in-95 duration-100 ${className}`}
      style={{ marginLeft: fit?.dx ?? 0, visibility: fit ? undefined : "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** A row inside a dropdown panel. */
function MenuItem({
  label,
  hint,
  icon,
  shortcut,
  selected,
  danger,
  onClick,
  role = "menuitem",
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  shortcut?: string;
  selected?: boolean;
  danger?: boolean;
  onClick: () => void;
  role?: "menuitem" | "radio";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      onPointerDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-xs transition-colors cursor-pointer ${
        danger
          ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50"
          : "text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      }`}
    >
      {icon && <span className="size-4 flex items-center justify-center text-zinc-500 shrink-0">{icon}</span>}
      <span className="flex-1 min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">{hint}</span>}
      </span>
      {shortcut && <kbd className="text-[10px] font-mono text-zinc-400">{shortcut}</kbd>}
      {selected && <Check className="size-3.5 text-zinc-900 dark:text-zinc-100 shrink-0" />}
    </button>
  );
}

export const FlowShapeMenu = memo(function FlowShapeMenu({ selectedNode }: FlowShapeMenuProps) {
  const { setNodes, getInternalNode, fitView } = useReactFlow();
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [linkInput, setLinkInput] = useState("https://");
  const editingNodeId = useFlowCanvasStore((s) => s.editingNodeId);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarDx, setToolbarDx] = useState(0);
  // Re-render on pan and zoom so the toolbar can slide back inside the canvas.
  useStore((s) => s.transform);
  const closeMenus = useCallback(() => setOpenMenu(null), []);
  useOutsideClick(toolbarRef, closeMenus);

  // A different selection starts with every dropdown closed.
  useEffect(() => setOpenMenu(null), [selectedNode?.id]);

  // Near the canvas edge, slide the toolbar sideways instead of letting the tool rail cover it.
  useLayoutEffect(() => {
    // NodeToolbar's wrapper is the unshifted box, so this never feeds back on itself.
    const wrapper = toolbarRef.current?.parentElement;
    if (!wrapper) return;
    const dx = horizontalFit(wrapper.getBoundingClientRect());
    if (dx !== toolbarDx) setToolbarDx(dx);
  });

  const toggleMenu = (id: MenuId) => setOpenMenu((cur) => (cur === id ? null : id));

  const handleCenter = useCallback(
    (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (!selectedNode) return;
      fitView({
        nodes: [{ id: selectedNode.id }],
        duration: 300,
        maxZoom: 1.15,
        padding: 0.25,
      });
    },
    [fitView, selectedNode]
  );

  const handleDelete = useCallback(
    (e?: React.MouseEvent | React.PointerEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (!selectedNode?.id) return;
      // The store releases a region's children; React Flow's deleteElements would delete them.
      useFlowCanvasStore.getState().deleteNode(selectedNode.id);
    },
    [selectedNode]
  );

  const handleFormatAction = useCallback(
    (format: TextFormatType, options?: { url?: string; color?: HighlightColor }) => {
      if (!selectedNode) return;
      const id = selectedNode.id;
      let textarea = document.getElementById(`text-node-input-${id}`) as HTMLTextAreaElement | null;
      if (
        !textarea &&
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLTextAreaElement &&
        document.activeElement.id.startsWith("text-node-input-")
      ) {
        textarea = document.activeElement;
      }

      if (textarea) {
        const updated = applyFormattingToTextarea(textarea, format, options);
        useFlowCanvasStore.getState().updateNodeData(id, { text: updated });
        setNodes((nodes) =>
          nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: updated } } : n))
        );
      } else {
        const currentText = (selectedNode.data?.text as string) || "";
        const updated = applyFormattingToString(currentText, format, options);
        useFlowCanvasStore.getState().updateNodeData(id, { text: updated });
        setNodes((nodes) =>
          nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: updated } } : n))
        );
      }
    },
    [selectedNode, setNodes]
  );

  const handleFontSize = useCallback(
    (size: number) => {
      if (!selectedNode) return;
      const newSize = Math.min(72, Math.max(10, size));
      useFlowCanvasStore.getState().updateNodeData(selectedNode.id, { fontSize: newSize });
    },
    [selectedNode]
  );

  if (!selectedNode) return null;

  const isText = selectedNode.type === "text";
  const isArrow = selectedNode.type === "arrow";
  const isFillEligible = selectedNode.type === "box" || selectedNode.type === "circle";
  const isBorderEligible =
    selectedNode.type === "box" ||
    selectedNode.type === "circle" ||
    selectedNode.type === "focusTask" ||
    selectedNode.type === "projectFrame" ||
    selectedNode.type === "arrow";

  // Derive current color hex from node type
  const currentHex = (() => {
    if (selectedNode.type === "arrow") {
      return (selectedNode.data?.strokeColor as string) || (selectedNode.data?.color as string) || "#6366f1";
    }
    if (selectedNode.type === "box" || selectedNode.type === "circle") {
      return (selectedNode.data?.strokeColor as string) || "#3b82f6";
    }
    if (selectedNode.type === "projectFrame") {
      const accent = (selectedNode.data?.accent as string) || "blue";
      return COLOR_PRESETS.find((c) => c.accent === accent)?.hex || "#3b82f6";
    }
    if (selectedNode.type === "focusTask") {
      const paper = (selectedNode.data?.paper as string) || "cream";
      return COLOR_PRESETS.find((c) => c.paper === paper)?.hex || "#f59e0b";
    }
    if (selectedNode.type === "note") {
      const variant = (selectedNode.data?.variant as string) || "yellow";
      return COLOR_PRESETS.find((c) => c.accent === variant)?.hex || (selectedNode.data?.color as string) || "#f59e0b";
    }
    return (selectedNode.data?.color as string) || "#71717a";
  })();

  const currentFontSize = (selectedNode.data?.fontSize as number) || 16;

  const handleColorChange = (color: typeof COLOR_PRESETS[0]) => {
    setOpenMenu(null);
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        if (node.type === "arrow") {
          return { ...node, data: { ...node.data, strokeColor: color.hex, color: color.hex } };
        }
        if (node.type === "box" || node.type === "circle") {
          const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
          const isSolid = node.data?.fillStyle === "solid";
          const solidColor = isDark ? color.solidDark : color.solidLight;
          return {
            ...node,
            data: {
              ...node.data,
              strokeColor: color.hex,
              color: isSolid ? solidColor : color.bg,
              solidColor: isSolid ? solidColor : undefined,
            },
          };
        }
        if (node.type === "projectFrame") {
          return { ...node, data: { ...node.data, accent: color.accent as ProjectAccent } };
        }
        if (node.type === "focusTask") {
          return { ...node, data: { ...node.data, paper: color.paper as TaskPaperTheme } };
        }
        if (node.type === "note") {
          return {
            ...node,
            data: {
              ...node.data,
              variant: color.accent,
              color: undefined,
              bg: undefined,
            },
          };
        }
        return { ...node, data: { ...node.data, color: color.hex } };
      })
    );
  };

  const currentSpear = ((selectedNode.data?.spear as string) || "end") as "end" | "start" | "both" | "none";

  const handleSpearChange = (spear: "end" | "start" | "both" | "none") => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, spear } };
      })
    );
  };

  const currentFillStyle = (selectedNode.data?.fillStyle as "hachure" | "tint" | "solid" | "none") || "hachure";

  const handleFillStyleChange = (fillStyle: "hachure" | "tint" | "solid" | "none") => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
        const preset = COLOR_PRESETS.find((c) => c.hex === currentHex) || COLOR_PRESETS[0];
        const solidColor = isDark ? preset.solidDark : preset.solidLight;

        if (fillStyle === "solid") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "solid",
              solidColor,
              color: solidColor,
            },
          };
        } else if (fillStyle === "tint") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "tint",
              solidColor: undefined,
              color: preset.bg,
            },
          };
        } else if (fillStyle === "hachure") {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "hachure",
              solidColor: undefined,
              color: preset.bg,
            },
          };
        } else {
          return {
            ...node,
            data: {
              ...node.data,
              fillStyle: "none",
              solidColor: undefined,
            },
          };
        }
      })
    );
  };

  const currentBorderStyle: "solid" | "dashed" | "dotted" =
    (selectedNode.data?.borderStyle as "solid" | "dashed" | "dotted") ||
    (selectedNode.type === "projectFrame" ? "dashed" : "solid");

  const currentBorderIcon = BORDER_STYLES.find((s) => s.id === currentBorderStyle)?.icon ?? BORDER_STYLES[0].icon;

  const handleBorderStyleChange = (borderStyle: "solid" | "dashed" | "dotted") => {
    setOpenMenu(null);
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== selectedNode.id) return node;
        return { ...node, data: { ...node.data, borderStyle } };
      })
    );
  };

  const nodeInternal = getInternalNode(selectedNode.id);
  const nodeAbsY = nodeInternal?.internals?.positionAbsolute?.y ?? selectedNode.position.y;
  const toolbarPosition = nodeAbsY < 70 ? Position.Bottom : Position.Top;
  const below = toolbarPosition === Position.Bottom;

  const isTextLike = isTextNode(selectedNode);
  const isEditingText = isText && editingNodeId === selectedNode.id;
  const style = textStyleOf(selectedNode);
  const styleMeta = TEXT_STYLES.find((t) => t.id === style) ?? TEXT_STYLES[0];
  const StyleIcon = styleMeta.icon;
  const sizePreset = TEXT_SIZES.find((t) => t.px === currentFontSize);
  const actionable = isActionable(selectedNode);
  const githubUrl = (selectedNode.data as any)?.githubIssueUrl as string | undefined;

  const colorControl = (
    <div className="relative">
      <ToolButton label="Change color" onClick={() => toggleMenu("color")}>
        <span
          className="size-4 rounded-full ring-1 ring-black/15 dark:ring-white/20"
          style={{ backgroundColor: currentHex }}
        />
      </ToolButton>
      {openMenu === "color" && (
        <Panel below={below} className="flex flex-col gap-1.5 p-1.5">
          <div className="flex items-center gap-1">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color.name}
                type="button"
                title={color.name}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => handleColorChange(color)}
                className={`size-6 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-110 cursor-pointer ${
                  currentHex === color.hex ? "ring-2 ring-offset-1 ring-zinc-900 dark:ring-zinc-100 dark:ring-offset-zinc-900" : ""
                }`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
          {isFillEligible && (
            <div className="flex items-center gap-0.5 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
              {(
                [
                  ["solid", "Solid", "Solid opaque background (no transparent)"],
                  ["tint", "Tint", "Soft translucent tint fill"],
                  ["hachure", "Sketch", "Sketchy cross-hatch fill"],
                  ["none", "Outline", "Transparent border outline only"],
                ] as const
              ).map(([id, label, title]) => (
                <button
                  key={id}
                  type="button"
                  title={title}
                  onClick={() => handleFillStyleChange(id)}
                  className={`flex-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    currentFillStyle === id
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );

  return (
    <NodeToolbar nodeId={selectedNode.id} isVisible={true} position={toolbarPosition} offset={10} align="center">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={isEditingText ? "Text formatting" : "Element actions"}
        style={{ translate: `${toolbarDx}px 0` }}
        className="flex items-center gap-0.5 p-1 rounded-xl bg-white/95 dark:bg-zinc-900/95 border border-zinc-200/90 dark:border-zinc-800 shadow-lg backdrop-blur-xl select-none pointer-events-auto whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {isEditingText ? (
          /* While typing: only formatting, like the inline text bar in Canva or Miro. */
          <>
            <div className="flex items-center">
              <ToolButton label="Decrease font size" onClick={() => handleFontSize(currentFontSize - 2)}>
                <Minus className="size-3.5" />
              </ToolButton>
              <span className="text-[11px] font-mono font-medium text-zinc-700 dark:text-zinc-300 w-9 text-center tabular-nums">
                {currentFontSize}px
              </span>
              <ToolButton label="Increase font size" onClick={() => handleFontSize(currentFontSize + 2)}>
                <Plus className="size-3.5" />
              </ToolButton>
            </div>
            <Divider />
            <ToolButton label="Bold (**text**)" onClick={() => handleFormatAction("bold")}>
              <Bold className="size-3.5" />
            </ToolButton>
            <ToolButton label="Italic (*text*)" onClick={() => handleFormatAction("italic")}>
              <Italic className="size-3.5" />
            </ToolButton>
            <ToolButton label="Underline (<u>text</u>)" onClick={() => handleFormatAction("underline")}>
              <Underline className="size-3.5" />
            </ToolButton>
            <ToolButton label="Strikethrough (~~text~~)" onClick={() => handleFormatAction("strike")}>
              <Strikethrough className="size-3.5" />
            </ToolButton>
            <div className="relative">
              <ToolButton label="Add Link ([text](url))" active={openMenu === "link"} onClick={() => toggleMenu("link")}>
                <Link2 className="size-3.5" />
              </ToolButton>
              {openMenu === "link" && (
                <Panel below={below} className="flex items-center gap-1.5 p-1.5">
                  <input
                    type="url"
                    value={linkInput}
                    autoFocus
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://example.com"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleFormatAction("link", { url: linkInput });
                        setOpenMenu(null);
                      } else if (e.key === "Escape") {
                        setOpenMenu(null);
                      }
                    }}
                    className="w-48 px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleFormatAction("link", { url: linkInput });
                      setOpenMenu(null);
                    }}
                    className="px-2 py-1 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 cursor-pointer"
                  >
                    Apply
                  </button>
                </Panel>
              )}
            </div>
            <div className="relative">
              <ToolButton label="Highlight text" active={openMenu === "highlight"} onClick={() => toggleMenu("highlight")}>
                <Highlighter className="size-3.5" />
              </ToolButton>
              {openMenu === "highlight" && (
                <Panel below={below} className="flex flex-col gap-1 p-1.5">
                  <div className="flex items-center gap-1.5 px-0.5">
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        title={`Highlight ${c.name}`}
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFormatAction("highlight", { color: c });
                          setOpenMenu(null);
                        }}
                        className="size-5 rounded-full border border-black/10 dark:border-white/20 transition-transform hover:scale-110 cursor-pointer"
                        style={{ backgroundColor: c.bg }}
                      />
                    ))}
                  </div>
                </Panel>
              )}
            </div>
            <ToolButton label="Clear formatting" onClick={() => handleFormatAction("clear")}>
              <RemoveFormatting className="size-3.5" />
            </ToolButton>
          </>
        ) : (
          <>
            {isTextLike && (
              <>
                {/* Style: one dropdown instead of three always-visible tabs */}
                <div className="relative">
                  <ToolButton
                    label={`Style: ${styleMeta.label}`}
                    active={openMenu === "style"}
                    onClick={() => toggleMenu("style")}
                    aria-haspopup="true"
                    aria-expanded={openMenu === "style"}
                    className="pr-1"
                  >
                    <StyleIcon className="size-3.5" />
                    <span>{styleMeta.label}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </ToolButton>
                  {openMenu === "style" && (
                    <Panel below={below} className="w-52">
                      <div role="radiogroup" aria-label="Text style">
                        {TEXT_STYLES.map((t) => {
                          const Icon = t.icon;
                          return (
                            <MenuItem
                              key={t.id}
                              role="radio"
                              label={t.label}
                              hint={t.hint}
                              icon={<Icon className="size-3.5" />}
                              selected={style === t.id}
                              onClick={() => {
                                setOpenMenu(null);
                                if (style !== t.id) setTextStyle(selectedNode.id, t.id);
                              }}
                            />
                          );
                        })}
                      </div>
                    </Panel>
                  )}
                </div>

                {selectedNode.type !== "focusTask" && (
                  <ToolButton
                    label="To-do (⌘↵)"
                    pressed={actionable}
                    onClick={() => toggleActionable(selectedNode.id)}
                    className={actionable ? "!bg-emerald-600 !text-white" : ""}
                  >
                    <CheckSquare className="size-3.5" />
                  </ToolButton>
                )}

                {isText && (
                  <div className="relative">
                    <ToolButton
                      label="Text size"
                      active={openMenu === "size"}
                      onClick={() => toggleMenu("size")}
                      className="pr-1"
                    >
                      <ALargeSmall className="size-4" />
                      <span className="text-[10px] font-mono">{sizePreset?.label ?? currentFontSize}</span>
                    </ToolButton>
                    {openMenu === "size" && (
                      <Panel below={below} className="flex items-center gap-0.5">
                        {TEXT_SIZES.map((t) => (
                          <button
                            key={t.label}
                            type="button"
                            title={`${t.px}px`}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => {
                              handleFontSize(t.px);
                              setOpenMenu(null);
                            }}
                            className={`h-7 min-w-8 px-2 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                              currentFontSize === t.px
                                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                                : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </Panel>
                    )}
                  </div>
                )}
              </>
            )}

            {selectedNode.type !== "image" && selectedNode.type !== "linkCard" && colorControl}

            {isBorderEligible && !isTextLike && (
              <div className="relative">
                <ToolButton label={`Border: ${currentBorderStyle}`} active={openMenu === "border"} onClick={() => toggleMenu("border")}>
                  {currentBorderIcon}
                </ToolButton>
                {openMenu === "border" && (
                  <Panel below={below} className="flex items-center gap-0.5">
                    {BORDER_STYLES.map((b) => (
                      <ToolButton
                        key={b.id}
                        label={b.label}
                        active={currentBorderStyle === b.id}
                        onClick={() => handleBorderStyleChange(b.id)}
                      >
                        {b.icon}
                      </ToolButton>
                    ))}
                  </Panel>
                )}
              </div>
            )}

            {isArrow && (
              <div className="relative">
                <ToolButton label="Arrowheads" active={openMenu === "spear"} onClick={() => toggleMenu("spear")} className="pr-1">
                  <span className="font-mono text-[11px]">
                    {currentSpear === "start" ? "←" : currentSpear === "both" ? "↔" : "→"}
                  </span>
                  <ChevronDown className="size-3 opacity-60" />
                </ToolButton>
                {openMenu === "spear" && (
                  <Panel below={below} className="w-44">
                    <MenuItem label="End →" selected={currentSpear === "end"} onClick={() => handleSpearChange("end")} />
                    <MenuItem label="← Start" selected={currentSpear === "start"} onClick={() => handleSpearChange("start")} />
                    <MenuItem label="↔ Both" selected={currentSpear === "both"} onClick={() => handleSpearChange("both")} />
                  </Panel>
                )}
              </div>
            )}

            <Divider />

            <ToolButton
              label="Ask AI about this"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("foqz:open-inline-chat", { detail: { shapeId: selectedNode.id } }))
              }
              className="text-blue-600 dark:text-blue-400"
            >
              <Sparkles className="size-3.5" />
            </ToolButton>
            <ToolButton
              label="Annotate"
              onClick={() =>
                window.dispatchEvent(new CustomEvent("foqz:open-annotation-composer", { detail: { nodeId: selectedNode.id } }))
              }
              className="text-amber-600 dark:text-amber-400"
            >
              <MessageSquarePlus className="size-3.5" />
            </ToolButton>

            <div className="relative">
              {(() => {
                const reminder = reminderOf(selectedNode);
                const pending = reminder && !reminder.fired;
                return (
                  <ToolButton
                    label={pending ? "Edit reminder" : "Remind me"}
                    active={openMenu === "reminder"}
                    pressed={Boolean(pending)}
                    onClick={() => toggleMenu("reminder")}
                    className={pending ? "text-violet-600 dark:text-violet-400" : ""}
                  >
                    {pending ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
                  </ToolButton>
                );
              })()}
              {openMenu === "reminder" && (
                <Panel below={below} className="w-60">
                  <ReminderPanel node={selectedNode} onDone={() => setOpenMenu(null)} />
                </Panel>
              )}
            </div>

            <div className="relative">
              <ToolButton label="More actions" active={openMenu === "more"} onClick={() => toggleMenu("more")}>
                <Ellipsis className="size-4" />
              </ToolButton>
              {openMenu === "more" && (
                <Panel below={below} className="w-52">
                  {isTextLike && actionable && (
                    <MenuItem
                      label={githubUrl ? `Open GitHub #${(selectedNode.data as any)?.githubIssueNumber}` : "Create GitHub issue"}
                      icon={<GitPullRequest className="size-3.5" />}
                      onClick={() => {
                        setOpenMenu(null);
                        if (githubUrl) window.open(githubUrl, "_blank", "noopener,noreferrer");
                        else
                          window.dispatchEvent(
                            new CustomEvent("foqz:open-create-github-issue", { detail: { taskId: selectedNode.id } })
                          );
                      }}
                    />
                  )}
                  {isBorderEligible && isTextLike && (
                    <MenuItem
                      label={`Border: ${currentBorderStyle}`}
                      hint="Solid, dashed or dotted"
                      icon={currentBorderIcon}
                      onClick={() => {
                        const order = ["solid", "dashed", "dotted"] as const;
                        handleBorderStyleChange(order[(order.indexOf(currentBorderStyle) + 1) % order.length]);
                      }}
                    />
                  )}
                  <MenuItem
                    label="Center on screen"
                    shortcut="⇧C"
                    icon={<Crosshair className="size-3.5" />}
                    onClick={() => {
                      setOpenMenu(null);
                      handleCenter();
                    }}
                  />
                  <MenuItem
                    label="Duplicate"
                    shortcut="⌘D"
                    icon={<Copy className="size-3.5" />}
                    onClick={() => {
                      setOpenMenu(null);
                      useFlowCanvasStore.getState().duplicateSelected();
                    }}
                  />
                  <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  <MenuItem
                    label="Delete"
                    shortcut="⌫"
                    danger
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => {
                      setOpenMenu(null);
                      handleDelete();
                    }}
                  />
                </Panel>
              )}
            </div>
          </>
        )}
      </div>
    </NodeToolbar>
  );
});
