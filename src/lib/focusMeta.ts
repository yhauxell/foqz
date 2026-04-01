const REFLECTION_KEY = 'focus-canvas-reflections'
const DAY_KEY = 'focus-canvas-last-template-day'

export type ReflectionEntry = {
  date: string
  score: number
  text: string
}

export function getReflectionHistory(): ReflectionEntry[] {
  try {
    const raw = localStorage.getItem(REFLECTION_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ReflectionEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendReflection(entry: ReflectionEntry) {
  const list = getReflectionHistory()
  list.unshift(entry)
  localStorage.setItem(REFLECTION_KEY, JSON.stringify(list.slice(0, 60)))
}

export function getLastTemplateDay(): string | null {
  return localStorage.getItem(DAY_KEY)
}

export function setLastTemplateDay(isoDate: string) {
  localStorage.setItem(DAY_KEY, isoDate)
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
