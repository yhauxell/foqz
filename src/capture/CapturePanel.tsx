import { useEffect, useRef, useState } from 'react'
import { CheckSquare, StickyNote, Type } from 'lucide-react'
import { parseCapture } from '@/lib/captureParse'

/**
 * The global quick capture panel: a small window of its own (capture.html, electron/main.cjs).
 * Enter sends the text to the board in the main window, which may stay hidden.
 */
export function CapturePanel() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const store = window.focusStore
    store
      ?.getSettings?.()
      .then((s) => {
        const dark =
          s.colorScheme === 'dark' ||
          (s.colorScheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
        document.documentElement.classList.toggle('dark', dark)
      })
      .catch(() => {})
    inputRef.current?.focus()
    // The panel is reused: start empty every time the shortcut opens it.
    return store?.capture?.onShown(() => {
      setText('')
      setTimeout(() => inputRef.current?.focus(), 0)
    })
  }, [])

  const parsed = parseCapture(text)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setText('')
      void window.focusStore?.capture?.dismiss()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!parsed.text) return
      void window.focusStore?.capture?.submit(text, e.metaKey || e.ctrlKey)
      setText('')
    }
  }

  const KindIcon = parsed.actionable ? CheckSquare : parsed.style === 'sticky' ? StickyNote : Type
  const kind = parsed.actionable ? 'To-do' : parsed.style === 'sticky' ? 'Sticky' : 'Text'

  return (
    <div className="h-full w-full p-3" data-testid="capture-panel">
      <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl overflow-hidden text-zinc-900 dark:text-zinc-100 font-sans">
        <div className="flex items-center gap-2.5 px-4 py-3">
          <KindIcon
            className={`size-4 shrink-0 ${parsed.actionable ? 'text-emerald-500' : 'text-zinc-400'}`}
            aria-label={kind}
          />
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Capture an idea to Foqz…"
            className="w-full bg-transparent border-0 outline-none text-[15px] placeholder:text-zinc-400"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 text-[11px] text-zinc-500">
          <span>↵ add to board</span>
          <span>⌘↵ as to-do</span>
          <span>[] to-do · /note sticky</span>
          <span className="ml-auto">esc close</span>
        </div>
      </div>
    </div>
  )
}
