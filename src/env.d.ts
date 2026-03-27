/// <reference types="vite/client" />

interface FocusStore {
  loadSnapshot: () => Promise<unknown>
  saveSnapshot: (snapshot: unknown) => Promise<{ ok: boolean; error?: string }>
}

interface Window {
  focusStore?: FocusStore
}
