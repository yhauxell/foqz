/** Parse capture prefixes: "[] buy milk" or "/todo buy milk" → to-do, "/note x" → sticky. */
export function parseCapture(raw: string): { text: string; actionable: boolean; style: 'plain' | 'sticky' } {
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
