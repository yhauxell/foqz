import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'

export type TLFocusSwimlaneShape = TLBaseShape<
  'focus-swimlane',
  {
    w: number
    h: number
    label: string
    collapsed: boolean
    expandedH: number
  }
>

export class FocusSwimlaneShapeUtil extends BaseBoxShapeUtil<TLFocusSwimlaneShape> {
  static override type = 'focus-swimlane' as const
  static override props = {
    w: T.number,
    h: T.number,
    label: T.string,
    collapsed: T.boolean,
    expandedH: T.number,
  }

  override getDefaultProps(): TLFocusSwimlaneShape['props'] {
    return { w: 640, h: 120, label: 'Project lane', collapsed: false, expandedH: 120 }
  }

  override component(shape: TLFocusSwimlaneShape) {
    return <SwimlaneBody shape={shape} />
  }

  override indicator(shape: TLFocusSwimlaneShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />
  }
}

function SwimlaneBody({ shape }: { shape: TLFocusSwimlaneShape }) {
  const editor = useEditor()
  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])
  const border = isDark ? '#3f3f46' : '#d4d4d8'

  return (
    <HTMLContainer
      id={shape.id}
      style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'all' }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 6,
          border: `1px solid ${border}`,
          background: isDark ? 'rgba(30,58,138,0.15)' : 'rgba(219,234,254,0.35)',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            borderBottom: shape.props.collapsed ? 'none' : `1px solid ${border}`,
          }}
        >
          <button
            type="button"
            title="Collapse / expand"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (shape.props.collapsed) {
                editor.updateShape({
                  id: shape.id,
                  type: 'focus-swimlane',
                  props: {
                    ...shape.props,
                    collapsed: false,
                    h: shape.props.expandedH,
                  },
                })
              } else {
                editor.updateShape({
                  id: shape.id,
                  type: 'focus-swimlane',
                  props: {
                    ...shape.props,
                    collapsed: true,
                    expandedH: Math.max(120, shape.props.h),
                    h: 36,
                  },
                })
              }
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: `1px solid ${border}`,
              background: isDark ? '#27272a' : '#fff',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {shape.props.collapsed ? '▶' : '▼'}
          </button>
          <input
            value={shape.props.label}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              editor.updateShape({
                id: shape.id,
                type: 'focus-swimlane',
                props: { ...shape.props, label: e.target.value },
              })
            }
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontWeight: 700,
              fontSize: 12,
              color: isDark ? '#e4e4e7' : '#1e3a8a',
            }}
          />
        </div>
        {!shape.props.collapsed ? (
          <div style={{ flex: 1, padding: 8, fontSize: 10, color: isDark ? '#a1a1aa' : '#52525b' }}>
            Place task cards in this lane for multi-project context.
          </div>
        ) : null}
      </div>
    </HTMLContainer>
  )
}
