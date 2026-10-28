import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search,
  Sparkles,
  ArrowRight,
  Layers,
  Target,
  Folder,
  CheckSquare,
  StickyNote,
  Type,
  CornerDownLeft,
  Plus,
  FolderPlus,
  Group,
  BookOpen,
  Keyboard,
  Settings,
} from 'lucide-react'
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore'
import { isActionable, isDone, nodeTitle, startFocus } from '@/lib/nodeBehaviors'
import { CANVAS_SHORTCUTS } from '@/poc/shortcuts/shortcutsConfig'

export type CommandBarView = 'search' | 'shortcuts'

interface GlobalSpotlightProps {
  open: boolean
  /** `reason` is set when the bar closes by capturing text or by Escape / a backdrop click. */
  onClose: (reason?: 'capture' | 'dismiss') => void
  /** "search" (default) or the "?" shortcuts list. */
  initialView?: CommandBarView
  /** Placeholder hint when opened for capture (⌘⇧N). */
  captureMode?: boolean
}

type SpotlightEntry =
  | {
      kind: 'action'
      id: string
      title: string
      shortcut?: string
      icon: React.ReactNode
      emphasis?: boolean
      perform: () => void
    }
  | {
      kind: 'node'
      id: string
      text: string
      nodeType: string
      actionable: boolean
      done: boolean
    }

function nodeBadge(nodeType: string, actionable: boolean) {
  if (nodeType === 'projectFrame') {
    return {
      label: 'Region',
      icon: <Folder className="size-3 text-blue-500 shrink-0" />,
      badgeClass:
        'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/80',
    }
  }
  if (actionable) {
    return {
      label: 'To-do',
      icon: <CheckSquare className="size-3 text-emerald-500 shrink-0" />,
      badgeClass:
        'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80',
    }
  }
  if (nodeType === 'note') {
    return {
      label: 'Sticky',
      icon: <StickyNote className="size-3 text-amber-500 shrink-0" />,
      badgeClass:
        'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80',
    }
  }
  if (nodeType === 'text' || nodeType === 'focusTask') {
    return {
      label: 'Text',
      icon: <Type className="size-3 text-zinc-500 dark:text-zinc-400 shrink-0" />,
      badgeClass:
        'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80',
    }
  }
  return {
    label: nodeType,
    icon: <Layers className="size-3 text-zinc-500 dark:text-zinc-400 shrink-0" />,
    badgeClass:
      'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700/80',
  }
}

/** Parse capture prefixes: "[] buy milk" or "/todo buy milk" → to-do, "/note x" → sticky. */
function parseCapture(raw: string): { text: string; actionable: boolean; style: 'plain' | 'sticky' } {
  let text = raw.trim()
  let actionable = false
  let style: 'plain' | 'sticky' = 'plain'
  if (/^(\[\s?\]|\/todo\b|\/t\b)/i.test(text)) {
    actionable = true
    text = text.replace(/^(\[\s?\]|\/todo\b|\/t\b)\s*/i, '')
  } else if (/^(\/note|\/sticky)\b/i.test(text)) {
    style = 'sticky'
    text = text.replace(/^(\/note|\/sticky)\s*/i, '')
  }
  return { text, actionable, style }
}

export function GlobalSpotlight({ open, onClose, initialView = 'search', captureMode = false }: GlobalSpotlightProps) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<CommandBarView>(initialView)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setView(initialView)
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialView])

  const flowNodes = useFlowCanvasStore((s) => s.nodes)

  const searchableNodes = useMemo(() => {
    const results: Array<Extract<SpotlightEntry, { kind: 'node' }>> = []
    for (const n of flowNodes) {
      let text = nodeTitle(n)
      if ((!text || text === n.id) && n.type === 'projectFrame') text = 'Untitled region'
      if (!text || text === n.id) continue
      results.push({
        kind: 'node',
        id: n.id,
        text,
        nodeType: n.type || 'unknown',
        actionable: isActionable(n),
        done: isDone(n),
      })
    }
    const rank = (e: (typeof results)[number]) =>
      e.nodeType === 'projectFrame' ? 0 : e.actionable && !e.done ? 1 : 2
    results.sort((a, b) => rank(a) - rank(b))
    return results
  }, [open, flowNodes])

  const capture = (raw: string, forceActionable = false) => {
    const parsed = parseCapture(raw)
    window.dispatchEvent(
      new CustomEvent('foqz:new-text', {
        detail: {
          text: parsed.text,
          actionable: forceActionable || parsed.actionable,
          style: parsed.style,
        },
      }),
    )
    onClose(parsed.text ? 'capture' : undefined)
  }

  const actions = useMemo(
    () => [
      {
        id: 'action-new-text',
        title: 'New text',
        shortcut: '⌘N',
        keywords: ['text', 'write', 'new', 'note', 'idea', 'task', 'todo'],
        icon: <Type className="size-3 text-zinc-500 shrink-0" />,
        perform: () => capture(''),
      },
      {
        id: 'action-new-region',
        title: 'New region',
        shortcut: '⌘⇧P',
        keywords: ['region', 'project', 'frame', 'area', 'group', 'container'],
        icon: <FolderPlus className="size-3 text-blue-500 shrink-0" />,
        perform: () => {
          window.dispatchEvent(new CustomEvent('foqz:new-project'))
          onClose()
        },
      },
      {
        id: 'action-group-selected',
        title: 'Group selection into a region',
        shortcut: '⌘G',
        keywords: ['group', 'region', 'wrap', 'frame'],
        icon: <Group className="size-3 text-indigo-500 shrink-0" />,
        perform: () => {
          const groupId = useFlowCanvasStore.getState().groupSelectedNodes()
          if (groupId) {
            window.dispatchEvent(new CustomEvent('foqz:flow-center-on', { detail: { id: groupId } }))
          }
          onClose()
        },
      },
      {
        id: 'action-ask-ai',
        title: 'Ask AI about the board',
        shortcut: '⌘J',
        keywords: ['ai', 'chat', 'ask', 'assistant', 'copilot'],
        icon: <Sparkles className="size-3 text-blue-500 shrink-0" />,
        perform: () => {
          window.dispatchEvent(
            new CustomEvent('foqz:open-inline-chat', {
              detail: { nodeId: useFlowCanvasStore.getState().selectedNodeId || '__canvas__' },
            }),
          )
          onClose()
        },
      },
      {
        id: 'action-logbook',
        title: 'Open Logbook',
        keywords: ['logbook', 'done', 'history', 'swept', 'archive'],
        icon: <BookOpen className="size-3 text-amber-500 shrink-0" />,
        perform: () => {
          window.dispatchEvent(new CustomEvent('foqz:open-logbook'))
          onClose()
        },
      },
      {
        id: 'action-shortcuts',
        title: 'Keyboard shortcuts',
        shortcut: '?',
        keywords: ['shortcuts', 'keys', 'help', 'keyboard'],
        icon: <Keyboard className="size-3 text-zinc-500 shrink-0" />,
        perform: () => {
          setView('shortcuts')
          setQuery('')
        },
      },
      {
        id: 'action-settings',
        title: 'Settings',
        shortcut: '⌘,',
        keywords: ['settings', 'preferences', 'ai', 'github', 'mcp'],
        icon: <Settings className="size-3 text-zinc-500 shrink-0" />,
        perform: () => {
          window.dispatchEvent(new CustomEvent('foqz:open-settings'))
          onClose()
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClose],
  )

  const filteredEntries = useMemo<SpotlightEntry[]>(() => {
    const raw = query.trim()
    const q = raw.toLowerCase()

    if (!q) {
      const actionEntries: SpotlightEntry[] = actions.map((a) => ({ kind: 'action', ...a }))
      return [...actionEntries, ...searchableNodes.slice(0, 15)]
    }

    if (q === '?') {
      return []
    }

    const parsed = parseCapture(raw)
    const label = parsed.text || '…'
    const captureEntries: SpotlightEntry[] = [
      {
        kind: 'action',
        id: 'action-capture',
        title:
          parsed.style === 'sticky'
            ? `Write sticky: "${label}"`
            : parsed.actionable
            ? `Write to-do: "${label}"`
            : `Write: "${label}"`,
        shortcut: '↵',
        emphasis: true,
        icon: parsed.actionable ? (
          <CheckSquare className="size-3.5 text-emerald-500 shrink-0" />
        ) : (
          <Plus className="size-3.5 text-blue-500 shrink-0" />
        ),
        perform: () => capture(raw),
      },
    ]
    if (!parsed.actionable && parsed.style === 'plain') {
      captureEntries.push({
        kind: 'action',
        id: 'action-capture-todo',
        title: `Write to-do: "${label}"`,
        shortcut: '⌘↵',
        icon: <CheckSquare className="size-3.5 text-emerald-500 shrink-0" />,
        perform: () => capture(raw, true),
      })
    }

    const matchedNodes = searchableNodes
      .filter((s) => s.text.toLowerCase().includes(q))
      .slice(0, 20)
    const matchedActions: SpotlightEntry[] = actions
      .filter((a) => a.title.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q)))
      .map((a) => ({ kind: 'action', ...a }))

    return [...captureEntries, ...matchedNodes, ...matchedActions]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, searchableNodes, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, view])

  useEffect(() => {
    if (query.trim() === '?') {
      setView('shortcuts')
      setQuery('')
    }
  }, [query])

  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement | undefined
      activeEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  useEffect(() => {
    if (!open) return
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (view === 'shortcuts' && initialView !== 'shortcuts') {
          setView('search')
          setTimeout(() => inputRef.current?.focus(), 0)
          return
        }
        onClose('dismiss')
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown)
    return () => window.removeEventListener('keydown', onGlobalKeyDown)
  }, [open, onClose, view, initialView])

  const handleSelectNode = (nodeId: string) => {
    useFlowCanvasStore.getState().setSelectedNodeId(nodeId)
    window.dispatchEvent(new CustomEvent('foqz:flow-center-on', { detail: { id: nodeId } }))
    onClose()
  }

  const handleFocusNode = (nodeId: string) => {
    useFlowCanvasStore.getState().setSelectedNodeId(nodeId)
    startFocus(nodeId)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredEntries.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if ((e.metaKey || e.ctrlKey) && query.trim()) {
        capture(query, true)
        return
      }
      const selected = filteredEntries[selectedIndex]
      if (!selected) return
      if (selected.kind === 'action') selected.perform()
      else handleSelectNode(selected.id)
    }
  }

  if (!open) return null

  const rowClass = (isSelected: boolean) =>
    `flex items-center justify-between p-2.5 rounded-xl transition-all group cursor-pointer border ${
      isSelected
        ? 'bg-zinc-100 dark:bg-zinc-800/90 border-zinc-300 dark:border-zinc-700 shadow-2xs'
        : 'border-transparent hover:bg-zinc-100/70 dark:hover:bg-zinc-800/50'
    }`

  return (
    <div
      className="fixed inset-0 z-[7000] flex items-start justify-center pt-20 sm:pt-24 bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => onClose('dismiss')}
      data-testid="command-bar"
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {view === 'search' ? (
          <>
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <Search className="size-4 text-zinc-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  captureMode
                    ? 'Write something, press Enter. Start with [] for a to-do.'
                    : 'Find anything, run an action, or just type to write…'
                }
                className="w-full bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-zinc-400"
              />
              <span className="text-[10px] text-zinc-400 font-mono shrink-0">? shortcuts</span>
            </div>

            <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1">
              {filteredEntries.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">Nothing matches.</div>
              ) : (
                filteredEntries.map((item, index) => {
                  const isSelected = index === selectedIndex
                  if (item.kind === 'action') {
                    return (
                      <div
                        key={item.id}
                        className={rowClass(isSelected)}
                        onClick={() => item.perform()}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="size-6 rounded-md flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shrink-0">
                            {item.icon}
                          </span>
                          <span
                            className={`truncate text-xs ${
                              item.emphasis ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                            }`}
                          >
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {item.shortcut && (
                            <kbd className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/70 px-1.5 py-0.5 rounded">
                              {item.shortcut}
                            </kbd>
                          )}
                          {isSelected && <CornerDownLeft className="size-3.5 text-zinc-400" />}
                        </div>
                      </div>
                    )
                  }

                  const badge = nodeBadge(item.nodeType, item.actionable)
                  return (
                    <div
                      key={item.id}
                      className={rowClass(isSelected)}
                      onClick={() => handleSelectNode(item.id)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide uppercase shrink-0 border ${badge.badgeClass}`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </span>
                        <span
                          className={`truncate text-xs font-medium ${
                            item.done ? 'line-through text-zinc-400' : 'text-foreground'
                          }`}
                        >
                          {item.text}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {item.actionable && !item.done && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleFocusNode(item.id)
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-300 text-[10px] font-medium hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Focus here"
                          >
                            <Target className="size-2.5" />
                            <span>Focus</span>
                          </button>
                        )}
                        {item.nodeType === 'projectFrame' && (
                          <span className="text-[11px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                            Jump <ArrowRight className="size-3 ml-0.5 inline" />
                          </span>
                        )}
                        {isSelected && <CornerDownLeft className="size-3.5 text-zinc-400" />}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col max-h-[520px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Keyboard className="size-4 text-zinc-500" />
                <span>Shortcuts</span>
              </div>
              {initialView !== 'shortcuts' && (
                <button
                  type="button"
                  onClick={() => setView('search')}
                  className="text-[11px] text-zinc-500 hover:text-foreground cursor-pointer"
                >
                  Back to search
                </button>
              )}
            </div>
            <div className="overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {(['Text', 'Tools', 'Canvas', 'App'] as const).map((cat) => (
                <div key={cat} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 pb-1">
                    {cat}
                  </div>
                  {CANVAS_SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 py-0.5" title={s.description}>
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{s.name}</span>
                      <kbd className="font-mono text-[10px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-1.5 py-0.5 rounded shrink-0">
                        {s.keyDisplay}
                      </kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/60 dark:bg-zinc-950/40 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 select-none">
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>⌘↵ write as to-do</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
