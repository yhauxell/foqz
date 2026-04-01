import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'
import { appendReflection, getReflectionHistory, todayIso } from '../../lib/focusMeta'

export type TLFocusReflectionShape = TLBaseShape<
  'focus-reflection',
  {
    w: number
    h: number
    score: number
    text: string
    date: string
  }
>

export class FocusReflectionShapeUtil extends BaseBoxShapeUtil<TLFocusReflectionShape> {
  static override type = 'focus-reflection' as const
  static override props = {
    w: T.number,
    h: T.number,
    score: T.number,
    text: T.string,
    date: T.string,
  }

  override getDefaultProps(): TLFocusReflectionShape['props'] {
    return {
      w: 280,
      h: 220,
      score: 3,
      text: '',
      date: todayIso(),
    }
  }

  override component(shape: TLFocusReflectionShape) {
    return <ReflectionBody shape={shape} />
  }

  override indicator(shape: TLFocusReflectionShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />
  }
}

function ReflectionBody({ shape }: { shape: TLFocusReflectionShape }) {
  const editor = useEditor()
  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])
  const border = isDark ? '#3f3f46' : '#d4d4d8'

  const update = (patch: Partial<TLFocusReflectionShape['props']>) => {
    editor.updateShape({
      id: shape.id,
      type: 'focus-reflection',
      props: { ...shape.props, ...patch },
    })
  }

  const saveToHistory = () => {
    appendReflection({
      date: shape.props.date || todayIso(),
      score: shape.props.score,
      text: shape.props.text,
    })
    // eslint-disable-next-line no-alert
    window.alert('Reflection saved to local history (see sidebar).')
  }

  const history = getReflectionHistory().slice(0, 3)

  return (
    <HTMLContainer id={shape.id} style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          border: `1px solid ${border}`,
          padding: 8,
          boxSizing: 'border-box',
          background: isDark ? '#18181b' : '#fff',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, color: isDark ? '#fafafa' : '#18181b' }}>Daily reflection</div>
        <label style={{ fontSize: 10, color: isDark ? '#a1a1aa' : '#52525b' }}>
          How was today? ({shape.props.score}/5)
          <input
            type="range"
            min={1}
            max={5}
            value={shape.props.score}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => update({ score: Number(e.target.value) })}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <textarea
          placeholder="Notes…"
          value={shape.props.text}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => update({ text: e.target.value })}
          style={{
            flex: 1,
            minHeight: 48,
            resize: 'none',
            border: `1px solid ${border}`,
            borderRadius: 4,
            padding: 6,
            fontSize: 11,
            background: isDark ? '#27272a' : '#fafafa',
            color: isDark ? '#fafafa' : '#18181b',
          }}
        />
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            saveToHistory()
          }}
          style={{ fontSize: 11, padding: '6px 0', cursor: 'pointer' }}
        >
          Save to history
        </button>
        {history.length ? (
          <div style={{ fontSize: 9, color: isDark ? '#71717a' : '#71717a' }}>
            Recent:{' '}
            {history.map((h) => (
              <div key={h.date + h.score}>
                {h.date} — {h.score}/5
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </HTMLContainer>
  )
}
