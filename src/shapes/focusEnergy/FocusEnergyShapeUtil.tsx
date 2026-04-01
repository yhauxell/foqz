import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'

export type TLFocusEnergyShape = TLBaseShape<
  'focus-energy',
  {
    w: number
    h: number
    level: number
  }
>

export class FocusEnergyShapeUtil extends BaseBoxShapeUtil<TLFocusEnergyShape> {
  static override type = 'focus-energy' as const
  static override props = {
    w: T.number,
    h: T.number,
    level: T.number,
  }

  override getDefaultProps(): TLFocusEnergyShape['props'] {
    return { w: 200, h: 44, level: 3 }
  }

  override component(shape: TLFocusEnergyShape) {
    return <EnergyBody shape={shape} />
  }

  override indicator(shape: TLFocusEnergyShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />
  }
}

function EnergyBody({ shape }: { shape: TLFocusEnergyShape }) {
  const editor = useEditor()
  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])
  const border = isDark ? '#3f3f46' : '#d4d4d8'

  const setLevel = (level: number) => {
    editor.updateShape({
      id: shape.id,
      type: 'focus-energy',
      props: { ...shape.props, level: Math.min(5, Math.max(1, level)) },
    })
  }

  return (
    <HTMLContainer id={shape.id} style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 6,
          border: `1px solid ${border}`,
          padding: 6,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: isDark ? '#18181b' : '#fff',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: isDark ? '#a1a1aa' : '#52525b' }}>
          Energy today (1–5)
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setLevel(n)
              }}
              style={{
                flex: 1,
                height: 18,
                borderRadius: 4,
                border: '1px solid #d4d4d8',
                background: n <= shape.props.level ? '#22c55e' : isDark ? '#27272a' : '#f4f4f5',
                color: n <= shape.props.level ? '#fff' : isDark ? '#a1a1aa' : '#52525b',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </HTMLContainer>
  )
}
