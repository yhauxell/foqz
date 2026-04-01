import { BaseBoxShapeUtil, HTMLContainer, T, TLBaseShape, useEditor, useValue } from 'tldraw'
import { useEffect, useState } from 'react'

export type TLFocusTimelineShape = TLBaseShape<
  'focus-timeline',
  {
    w: number
    h: number
    startHour: number
    endHour: number
    orientation: 'horizontal' | 'vertical'
  }
>

function pad2(n: number) {
  return n.toString().padStart(2, '0')
}

export class FocusTimelineShapeUtil extends BaseBoxShapeUtil<TLFocusTimelineShape> {
  static override type = 'focus-timeline' as const
  static override props = {
    w: T.number,
    h: T.number,
    startHour: T.number,
    endHour: T.number,
    orientation: T.literalEnum('horizontal', 'vertical'),
  }

  override getDefaultProps(): TLFocusTimelineShape['props'] {
    return {
      w: 720,
      h: 64,
      startHour: 8,
      endHour: 18,
      orientation: 'horizontal',
    }
  }

  override component(shape: TLFocusTimelineShape) {
    return <TimelineBody shape={shape} />
  }

  override indicator(shape: TLFocusTimelineShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />
  }
}

function TimelineBody({ shape }: { shape: TLFocusTimelineShape }) {
  const editor = useEditor()
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000)
    return () => window.clearInterval(id)
  }, [])

  const isDark = useValue('dark', () => editor.user.getIsDarkMode(), [editor])

  const { w, h, startHour, endHour, orientation } = shape.props
  // Support overnight ranges by allowing endHour > 24 (e.g. 22 → 30 for 22:00–06:00).
  const hours = Math.max(1, Math.round(endHour - startHour))
  const now = new Date()
  const rawNowH = now.getHours() + now.getMinutes() / 60
  const nowH = endHour > 24 && rawNowH < (startHour % 24) ? rawNowH + 24 : rawNowH
  const frac = (nowH - startHour) / hours
  const inRange = nowH >= startHour && nowH <= endHour

  const bg = isDark ? '#18181b' : '#f4f4f5'
  const line = isDark ? '#3f3f46' : '#d4d4d8'
  const past = isDark ? '#27272a' : '#e4e4e7'
  const future = isDark ? '#1e293b' : '#eff6ff'

  if (orientation === 'horizontal') {
    const slotW = w / hours
    return (
      <HTMLContainer id={shape.id} style={{ width: w, height: h, pointerEvents: 'all' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 6,
            border: `1px solid ${line}`,
            background: bg,
            position: 'relative',
            overflow: 'hidden',
            fontFamily: 'var(--font-sans), system-ui, sans-serif',
          }}
        >
          {Array.from({ length: hours }, (_, i) => {
            const hour = startHour + i
            const isPast = hour < nowH
            const displayHour = ((Math.round(hour) % 24) + 24) % 24
            return (
              <div
                key={hour}
                style={{
                  position: 'absolute',
                  left: i * slotW,
                  top: 0,
                  width: slotW,
                  height: '100%',
                  borderRight: `1px solid ${line}`,
                  background: isPast ? past : future,
                  boxSizing: 'border-box',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 6,
                    fontSize: 10,
                    color: isDark ? '#a1a1aa' : '#52525b',
                    fontWeight: 600,
                  }}
                >
                  {pad2(displayHour)}:00
                </span>
              </div>
            )
          })}
          {inRange ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: Math.max(0, Math.min(w - 2, frac * w)),
                width: 2,
                height: '100%',
                background: '#ef4444',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </div>
      </HTMLContainer>
    )
  }

  const slotH = h / hours
  return (
    <HTMLContainer id={shape.id} style={{ width: w, height: h, pointerEvents: 'all' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 6,
          border: `1px solid ${line}`,
          background: bg,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'row',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
      >
        <div style={{ flex: 1, position: 'relative' }}>
          {Array.from({ length: hours }, (_, i) => {
            const hour = startHour + i
            const isPast = hour < nowH
            const displayHour = ((Math.round(hour) % 24) + 24) % 24
            return (
              <div
                key={hour}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: i * slotH,
                  width: '100%',
                  height: slotH,
                  borderBottom: `1px solid ${line}`,
                  background: isPast ? past : future,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 4,
                    left: 6,
                    fontSize: 10,
                    color: isDark ? '#a1a1aa' : '#52525b',
                    fontWeight: 600,
                  }}
                >
                  {pad2(displayHour)}:00
                </span>
              </div>
            )
          })}
          {inRange ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: Math.max(0, Math.min(h - 2, frac * h)),
                width: '100%',
                height: 2,
                background: '#ef4444',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </div>
      </div>
    </HTMLContainer>
  )
}
