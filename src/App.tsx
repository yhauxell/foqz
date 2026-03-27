import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor, Tldraw, getSnapshot, loadSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'

const SAVE_DELAY_MS = 500

export default function App() {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unlisten = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState('Loading board...')

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      unlisten.current?.()
    }
  }, [])

  const handlers = useMemo(
    () => ({
      async onMount(editor: Editor) {
        try {
          const snapshot = await window.focusStore?.loadSnapshot?.()
          if (snapshot) {
            loadSnapshot(editor.store, snapshot)
            setStatus('Board restored')
          } else {
            setStatus('New board ready')
          }
        } catch {
          setStatus('Could not load previous board')
        }

        unlisten.current?.()
        unlisten.current = editor.store.listen(
          () => {
            if (saveTimer.current) window.clearTimeout(saveTimer.current)
            saveTimer.current = setTimeout(async () => {
              const snapshot = getSnapshot(editor.store)
              const result = await window.focusStore?.saveSnapshot?.(snapshot)
              setStatus(result?.ok ? 'Saved' : 'Save failed')
            }, SAVE_DELAY_MS)
          },
          { scope: 'document' }
        )
      },
    }),
    []
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">Focus Canvas</div>
        <div className="status">{status}</div>
      </header>
      <main className="canvas">
        <Tldraw onMount={handlers.onMount} />
      </main>
    </div>
  )
}
