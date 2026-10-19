import type { LogbookDay, LogbookEntry } from "@/types/logbook";

const LOCAL_STORAGE_MONTHS_KEY = "foqz_logbook_months";
const LOCAL_STORAGE_MONTH_PREFIX = "foqz_logbook_month_";

function getBrowserMonthData(month: string): { days: Record<string, LogbookDay> } {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_MONTH_PREFIX}${month}`);
    if (!raw) return { days: {} };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.days === "object") return parsed;
    return { days: {} };
  } catch {
    return { days: {} };
  }
}

function saveBrowserMonthData(month: string, data: { days: Record<string, LogbookDay> }) {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_MONTH_PREFIX}${month}`, JSON.stringify(data));
    const rawMonths = localStorage.getItem(LOCAL_STORAGE_MONTHS_KEY);
    const months: string[] = rawMonths ? JSON.parse(rawMonths) : [];
    if (!months.includes(month)) {
      months.push(month);
      months.sort().reverse();
      localStorage.setItem(LOCAL_STORAGE_MONTHS_KEY, JSON.stringify(months));
    }
  } catch (e) {
    console.error("Failed to save logbook to localStorage:", e);
  }
}

/**
 * Appends completed task entries to a LogbookDay in the current monthly partition.
 */
export async function appendLogbookEntries(payload: {
  workdayId: string;
  window?: { startMin: number; endMin: number };
  entries: LogbookEntry[];
  summary?: string;
}): Promise<{ ok: boolean; sweptCount?: number; workdayId?: string; error?: string }> {
  if (typeof window !== "undefined" && window.focusStore?.logbook?.append) {
    return window.focusStore.logbook.append(payload);
  }

  // Web / Test fallback
  const { workdayId, window: workWindow, entries, summary } = payload;
  if (!workdayId) return { ok: false, error: "workdayId is required" };
  const month = workdayId.slice(0, 7);
  const monthData = getBrowserMonthData(month);

  const existingDay = monthData.days[workdayId] || {
    workdayId,
    window: workWindow || { startMin: 540, endMin: 1020 },
    sweptAt: Date.now(),
    entries: [],
  };

  if (workWindow) existingDay.window = workWindow;
  if (summary) existingDay.summary = summary;
  existingDay.sweptAt = Date.now();

  const map = new Map<string, LogbookEntry>();
  for (const item of existingDay.entries) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of entries) {
    if (item?.id) map.set(item.id, item);
  }
  existingDay.entries = Array.from(map.values());
  monthData.days[workdayId] = existingDay;

  saveBrowserMonthData(month, monthData);
  return { ok: true, sweptCount: entries.length, workdayId };
}

/**
 * Lists all LogbookDay partitions across recorded months, sorted newest first.
 */
export async function listLogbookDays(opts?: { limitMonths?: number }): Promise<LogbookDay[]> {
  if (typeof window !== "undefined" && window.focusStore?.logbook?.listDays) {
    return window.focusStore.logbook.listDays(opts);
  }

  // Web / Test fallback
  try {
    const rawMonths = localStorage.getItem(LOCAL_STORAGE_MONTHS_KEY);
    const months: string[] = rawMonths ? JSON.parse(rawMonths) : [];
    const limit = opts?.limitMonths ?? 12;
    const targetMonths = months.slice(0, limit);

    const allDays: LogbookDay[] = [];
    for (const m of targetMonths) {
      const data = getBrowserMonthData(m);
      for (const day of Object.values(data.days)) {
        if (day && day.workdayId) {
          allDays.push(day);
        }
      }
    }
    allDays.sort((a, b) => b.workdayId.localeCompare(a.workdayId));
    return allDays;
  } catch {
    return [];
  }
}

/**
 * Retrieves specific historical LogbookEntry records by their IDs.
 */
export async function getLogbookEntriesByIds(ids: string[]): Promise<LogbookEntry[]> {
  if (!ids || ids.length === 0) return [];
  if (typeof window !== "undefined" && window.focusStore?.logbook?.getEntriesByIds) {
    return window.focusStore.logbook.getEntriesByIds(ids);
  }

  // Web / Test fallback
  const idSet = new Set(ids);
  const days = await listLogbookDays();
  const results: LogbookEntry[] = [];
  for (const day of days) {
    for (const entry of day.entries || []) {
      if (idSet.has(entry.id)) {
        results.push(entry);
      }
    }
  }
  return results;
}

/**
 * Removes an entry from the Logbook (used when restoring a task back to the spatial canvas).
 */
export async function removeLogbookEntry(
  entryId: string
): Promise<{ ok: boolean; removedEntry?: LogbookEntry; error?: string }> {
  if (!entryId) return { ok: false, error: "entryId is required" };
  if (typeof window !== "undefined" && window.focusStore?.logbook?.removeEntry) {
    return window.focusStore.logbook.removeEntry(entryId);
  }

  // Web / Test fallback
  const rawMonths = localStorage.getItem(LOCAL_STORAGE_MONTHS_KEY);
  const months: string[] = rawMonths ? JSON.parse(rawMonths) : [];

  for (const m of months) {
    const monthData = getBrowserMonthData(m);
    let modified = false;
    let removedEntry: LogbookEntry | undefined = undefined;

    for (const day of Object.values(monthData.days)) {
      const idx = day.entries.findIndex((e) => e.id === entryId);
      if (idx !== -1) {
        removedEntry = day.entries[idx];
        day.entries.splice(idx, 1);
        modified = true;
        break;
      }
    }

    if (modified) {
      saveBrowserMonthData(m, monthData);
      return { ok: true, removedEntry };
    }
  }

  return { ok: false, error: "Entry not found" };
}

/**
 * Searches completed tasks across all logged workdays.
 */
export async function searchLogbookEntries(
  query: string
): Promise<Array<LogbookEntry & { workdayId: string }>> {
  if (!query || !query.trim()) return [];
  if (typeof window !== "undefined" && window.focusStore?.logbook?.search) {
    return window.focusStore.logbook.search(query);
  }

  // Web / Test fallback
  const q = query.toLowerCase().trim();
  const days = await listLogbookDays();
  const matches: Array<LogbookEntry & { workdayId: string }> = [];

  for (const day of days) {
    for (const entry of day.entries || []) {
      const matchTitle = entry.title?.toLowerCase().includes(q);
      const matchNotes = entry.notes?.toLowerCase().includes(q);
      const matchProject = entry.projectTitle?.toLowerCase().includes(q);
      if (matchTitle || matchNotes || matchProject) {
        matches.push({
          ...entry,
          workdayId: day.workdayId,
        });
      }
    }
  }
  return matches;
}
