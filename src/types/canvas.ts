export const ALL_PROJECT_ACCENTS = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "indigo",
  "cyan",
  "orange",
  "zinc",
] as const;

export type ProjectAccent = (typeof ALL_PROJECT_ACCENTS)[number];

export type ProjectConnectors = {
  githubRepo?: string;
  notionWorkspace?: string;
  sentryProject?: string;
  mcpServers?: string[];
};

export const ACCENT_STYLES: Record<
  ProjectAccent,
  {
    name: string;
    dotHex: string;
    border: string;
    selectedRing: string;
    headerBg: string;
    headerBorder: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    badgeDot: string;
    accentText: string;
  }
> = {
  blue: {
    name: "Ocean Blue",
    dotHex: "#3b82f6",
    border: "border-blue-200/90 dark:border-blue-900/60",
    selectedRing: "ring-blue-500/40 dark:ring-blue-500/50 border-blue-500",
    headerBg: "bg-blue-50/70 dark:bg-blue-950/40",
    headerBorder: "border-b border-blue-200/60 dark:border-blue-900/50",
    badgeBg: "bg-blue-100/90 dark:bg-blue-950/80",
    badgeText: "text-blue-700 dark:text-blue-300",
    badgeBorder: "border-blue-200 dark:border-blue-800/80",
    badgeDot: "bg-blue-500",
    accentText: "text-blue-600 dark:text-blue-400",
  },
  emerald: {
    name: "Mint Emerald",
    dotHex: "#10b981",
    border: "border-emerald-200/90 dark:border-emerald-900/60",
    selectedRing: "ring-emerald-500/40 dark:ring-emerald-500/50 border-emerald-500",
    headerBg: "bg-emerald-50/70 dark:bg-emerald-950/40",
    headerBorder: "border-b border-emerald-200/60 dark:border-emerald-900/50",
    badgeBg: "bg-emerald-100/90 dark:bg-emerald-950/80",
    badgeText: "text-emerald-700 dark:text-emerald-300",
    badgeBorder: "border-emerald-200 dark:border-emerald-800/80",
    badgeDot: "bg-emerald-500",
    accentText: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    name: "Warm Amber",
    dotHex: "#f59e0b",
    border: "border-amber-200/90 dark:border-amber-900/60",
    selectedRing: "ring-amber-500/40 dark:ring-amber-500/50 border-amber-500",
    headerBg: "bg-amber-50/70 dark:bg-amber-950/40",
    headerBorder: "border-b border-amber-200/60 dark:border-amber-900/50",
    badgeBg: "bg-amber-100/90 dark:bg-amber-950/80",
    badgeText: "text-amber-800 dark:text-amber-300",
    badgeBorder: "border-amber-200 dark:border-amber-800/80",
    badgeDot: "bg-amber-500",
    accentText: "text-amber-600 dark:text-amber-400",
  },
  rose: {
    name: "Soft Rose",
    dotHex: "#f43f5e",
    border: "border-rose-200/90 dark:border-rose-900/60",
    selectedRing: "ring-rose-500/40 dark:ring-rose-500/50 border-rose-500",
    headerBg: "bg-rose-50/70 dark:bg-rose-950/40",
    headerBorder: "border-b border-rose-200/60 dark:border-rose-900/50",
    badgeBg: "bg-rose-100/90 dark:bg-rose-950/80",
    badgeText: "text-rose-700 dark:text-rose-300",
    badgeBorder: "border-rose-200 dark:border-rose-800/80",
    badgeDot: "bg-rose-500",
    accentText: "text-rose-600 dark:text-rose-400",
  },
  indigo: {
    name: "Deep Indigo",
    dotHex: "#6366f1",
    border: "border-indigo-200/90 dark:border-indigo-900/60",
    selectedRing: "ring-indigo-500/40 dark:ring-indigo-500/50 border-indigo-500",
    headerBg: "bg-indigo-50/70 dark:bg-indigo-950/40",
    headerBorder: "border-b border-indigo-200/60 dark:border-indigo-900/50",
    badgeBg: "bg-indigo-100/90 dark:bg-indigo-950/80",
    badgeText: "text-indigo-700 dark:text-indigo-300",
    badgeBorder: "border-indigo-200 dark:border-indigo-800/80",
    badgeDot: "bg-indigo-500",
    accentText: "text-indigo-600 dark:text-indigo-400",
  },
  cyan: {
    name: "Sky Cyan",
    dotHex: "#06b6d4",
    border: "border-cyan-200/90 dark:border-cyan-900/60",
    selectedRing: "ring-cyan-500/40 dark:ring-cyan-500/50 border-cyan-500",
    headerBg: "bg-cyan-50/70 dark:bg-cyan-950/40",
    headerBorder: "border-b border-cyan-200/60 dark:border-cyan-900/50",
    badgeBg: "bg-cyan-100/90 dark:bg-cyan-950/80",
    badgeText: "text-cyan-700 dark:text-cyan-300",
    badgeBorder: "border-cyan-200 dark:border-cyan-800/80",
    badgeDot: "bg-cyan-500",
    accentText: "text-cyan-600 dark:text-cyan-400",
  },
  orange: {
    name: "Vibrant Orange",
    dotHex: "#f97316",
    border: "border-orange-200/90 dark:border-orange-900/60",
    selectedRing: "ring-orange-500/40 dark:ring-orange-500/50 border-orange-500",
    headerBg: "bg-orange-50/70 dark:bg-orange-950/40",
    headerBorder: "border-b border-orange-200/60 dark:border-orange-900/50",
    badgeBg: "bg-orange-100/90 dark:bg-orange-950/80",
    badgeText: "text-orange-700 dark:text-orange-300",
    badgeBorder: "border-orange-200 dark:border-orange-800/80",
    badgeDot: "bg-orange-500",
    accentText: "text-orange-600 dark:text-orange-400",
  },
  zinc: {
    name: "Monochrome Zinc",
    dotHex: "#71717a",
    border: "border-zinc-300/80 dark:border-zinc-800/80",
    selectedRing: "ring-zinc-500/40 dark:ring-zinc-400/50 border-zinc-500",
    headerBg: "bg-zinc-100/80 dark:bg-zinc-900/60",
    headerBorder: "border-b border-zinc-200 dark:border-zinc-800",
    badgeBg: "bg-zinc-100 dark:bg-zinc-800",
    badgeText: "text-zinc-700 dark:text-zinc-300",
    badgeBorder: "border-zinc-200 dark:border-zinc-700/80",
    badgeDot: "bg-zinc-400",
    accentText: "text-zinc-600 dark:text-zinc-400",
  },
};

/** Four sticky-note themes with tuned foregrounds for readable text */
export type TaskPaperTheme = "cream" | "fog" | "bloom" | "sage";

export function focusTaskShellColorForPriority(_priority: number): string {
  return "#18181b";
}
