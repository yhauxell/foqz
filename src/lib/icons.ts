import type { ComponentType, SVGProps } from "react";

/**
 * SVG icons for canvas elements. Lucide is the set (stroke icons that suit the hand-drawn
 * look). The full set loads lazily, the first time a picker opens or a board shows an
 * icon, so it never weighs on the main bundle. Boards store only `{ set, name }`.
 */
export interface IconRef {
  set: "lucide";
  /** Kebab-case Lucide name, e.g. "rocket", "database-zap". */
  name: string;
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;
export interface IconSet {
  names: string[];
  get: (name: string) => IconComponent | null;
}

const toPascal = (kebab: string) => kebab.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
const toKebab = (pascal: string) =>
  pascal
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])([0-9])/g, "$1-$2")
    .toLowerCase();

let loaded: IconSet | null = null;
let loading: Promise<IconSet> | null = null;

export function iconSetIfLoaded(): IconSet | null {
  return loaded;
}

export function loadIconSet(): Promise<IconSet> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("lucide-react").then((mod) => {
    const icons = (mod as any).icons as Record<string, IconComponent>;
    const names = Object.keys(icons).map(toKebab).sort();
    loaded = { names, get: (name) => icons[toPascal(name)] ?? null };
    return loaded;
  });
  return loading;
}

/** Words people search for that aren't in the icon's name. */
const ALIASES: Record<string, string[]> = {
  db: ["database"],
  sql: ["database"],
  storage: ["database", "hard-drive"],
  server: ["server"],
  api: ["webhook", "plug", "server"],
  cloud: ["cloud"],
  queue: ["list-ordered", "layers"],
  cache: ["zap", "memory-stick"],
  user: ["user", "circle-user"],
  person: ["user"],
  people: ["users"],
  team: ["users"],
  phone: ["smartphone"],
  mobile: ["smartphone", "tablet"],
  web: ["globe", "app-window"],
  browser: ["app-window", "globe"],
  idea: ["lightbulb"],
  goal: ["target", "flag"],
  money: ["dollar-sign", "wallet", "banknote"],
  pay: ["credit-card", "wallet"],
  mail: ["mail"],
  email: ["mail"],
  chat: ["message-circle", "messages-square"],
  bug: ["bug"],
  security: ["shield", "lock"],
  auth: ["key-round", "lock", "shield-check"],
  launch: ["rocket"],
  ship: ["rocket", "package"],
  time: ["clock", "timer"],
  calendar: ["calendar"],
  warning: ["triangle-alert"],
  done: ["circle-check", "check"],
  question: ["circle-help"],
  settings: ["settings", "sliders-horizontal"],
  search: ["search"],
  home: ["house"],
  ai: ["sparkles", "bot", "brain"],
  analytics: ["chart-line", "chart-bar"],
  chart: ["chart-line", "chart-bar", "chart-pie"],
  docs: ["book-open", "file-text"],
  file: ["file", "file-text"],
  code: ["code", "terminal"],
};

/** Name search with aliases; exact and prefix matches first. */
export function searchIcons(names: string[], query: string, limit = 96): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return names.slice(0, limit);
  const words = q.split(/\s+/);
  const aliasHits = new Set(words.flatMap((w) => ALIASES[w] ?? []));
  const scored: [string, number][] = [];
  for (const name of names) {
    let score = 0;
    if (name === q) score = 100;
    else if (aliasHits.has(name)) score = 80;
    else if (name.startsWith(q)) score = 60;
    else if (words.every((w) => name.includes(w))) score = name.split("-").some((p) => words.includes(p)) ? 40 : 20;
    if (score) scored.push([name, score - name.length / 100]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([n]) => n);
}

const RECENTS_KEY = "foqz_recent_icons";

export function recentIcons(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function rememberIcon(name: string) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify([name, ...recentIcons().filter((n) => n !== name)].slice(0, 16)));
  } catch {
    /* recents are a convenience */
  }
}

/** Elements that can carry an icon (or are one). */
export function canHaveIcon(node: { type?: string } | null | undefined): boolean {
  return node?.type === "text" || node?.type === "box" || node?.type === "circle" || node?.type === "icon";
}

export function iconOf(node: { data?: unknown } | null | undefined): IconRef | null {
  const i = (node?.data as any)?.icon;
  return i && i.set === "lucide" && typeof i.name === "string" ? (i as IconRef) : null;
}
