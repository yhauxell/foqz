import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'

export type TLFocusInboxShape = TLBaseShape<
  'focus-inbox',
  {
    w: number
    h: number
    label: string
  }
>

export class FocusInboxShapeUtil extends BaseBoxShapeUtil<TLFocusInboxShape> {
  static override type = 'focus-inbox' as const
  static override props = {
    w: T.number,
    h: T.number,
    label: T.string,
  }

  override getDefaultProps(): TLFocusInboxShape['props'] {
    return { w: 280, h: 200, label: 'Quick capture inbox' }
  }

  override component(shape: TLFocusInboxShape) {
    return <InboxBody shape={shape} />
  }

  override indicator(shape: TLFocusInboxShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />
  }
}

function InboxBody({ shape }: { shape: TLFocusInboxShape }) {
  const editor = useEditor()
  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])
  const border = isDark ? '#3f3f46' : '#d4d4d8'
  const bg = isDark ? '#18181b' : '#fafafa'

  return (
    <HTMLContainer id={shape.id} style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 8,
          border: `2px dashed ${border}`,
          background: bg,
          boxSizing: 'border-box',
          padding: 10,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#e4e4e7' : '#3f3f46', marginBottom: 6 }}>
          {shape.props.label}
        </div>
        <div style={{ fontSize: 10, color: isDark ? '#a1a1aa' : '#71717a', lineHeight: 1.4 }}>
          Drop task cards here. Use the quick capture bar (bottom) or Cmd+K → Add task to create items fast.
        </div>
      </div>
    </HTMLContainer>
  )
}
