import React, { useMemo } from 'react'
import { renderMarkdownBlock } from '@/lib/markdown'
import { cn } from '@/lib/utils'

interface MarkdownViewProps {
  content: string
  className?: string
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  const html = useMemo(() => {
    return renderMarkdownBlock(content)
  }, [content])

  return (
    <div
      className={cn('ai-markdown select-text', className)}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const target = e.target as HTMLElement
        const anchor = target.closest('a')
        if (anchor && anchor.href) {
          e.preventDefault()
          if (typeof window !== 'undefined' && (window as any).electron?.openExternal) {
            (window as any).electron.openExternal(anchor.href)
          } else {
            window.open(anchor.href, '_blank', 'noopener,noreferrer')
          }
        }
      }}
    />
  )
}
