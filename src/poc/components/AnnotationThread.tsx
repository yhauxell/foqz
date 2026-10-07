import React, { useState } from 'react';
import {
  MessageSquare,
  Check,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  Send,
  X,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  Bookmark,
  Sparkles,
} from 'lucide-react';
import type { Annotation, AnnotationKind } from '@/types/annotations';
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore';

interface AnnotationThreadProps {
  annotation: Annotation;
  elementTitle?: string;
  onClose: () => void;
  onOpenInlineChat?: (nodeId?: string) => void;
}

const KIND_CONFIG: Record<
  AnnotationKind,
  { label: string; icon: React.ReactNode; badgeClass: string }
> = {
  comment: {
    label: 'Comment',
    icon: <MessageSquare className="size-3" />,
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
  },
  question: {
    label: 'Question',
    icon: <HelpCircle className="size-3" />,
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
  },
  decision: {
    label: 'Decision',
    icon: <Bookmark className="size-3" />,
    badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
  },
  constraint: {
    label: 'Constraint',
    icon: <AlertCircle className="size-3" />,
    badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
  },
  todo: {
    label: 'To-do',
    icon: <CheckCircle2 className="size-3" />,
    badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
  },
};

export function AnnotationThread({
  annotation,
  elementTitle,
  onClose,
  onOpenInlineChat,
}: AnnotationThreadProps) {
  const [replyText, setReplyText] = useState('');
  const replyAnnotation = useFlowCanvasStore((s) => s.replyAnnotation);
  const setAnnotationStatus = useFlowCanvasStore((s) => s.setAnnotationStatus);
  const setAnnotationKind = useFlowCanvasStore((s) => s.setAnnotationKind);
  const toggleAnnotationAiVisible = useFlowCanvasStore((s) => s.toggleAnnotationAiVisible);
  const deleteAnnotation = useFlowCanvasStore((s) => s.deleteAnnotation);

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyText.trim();
    if (!trimmed) return;
    replyAnnotation({
      annotationId: annotation.id,
      body: trimmed,
      author: 'user',
    });
    setReplyText('');
  };

  const handleToggleStatus = () => {
    setAnnotationStatus(
      annotation.id,
      annotation.status === 'open' ? 'resolved' : 'open'
    );
  };

  const handleAskAi = () => {
    if (onOpenInlineChat) {
      onOpenInlineChat(annotation.anchor.nodeId || undefined);
    }
  };

  const currentKind = KIND_CONFIG[annotation.kind] || KIND_CONFIG.comment;

  return (
    <div
      className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl glass-panel shadow-2xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl text-zinc-900 dark:text-zinc-100 flex flex-col overflow-hidden text-xs select-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-2 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${currentKind.badgeClass}`}
          >
            {currentKind.icon}
            <span>{currentKind.label}</span>
          </span>

          {annotation.status === 'resolved' && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
              <Check className="size-2.5 stroke-[3]" />
              Resolved
            </span>
          )}

          {elementTitle && (
            <span
              className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-[100px]"
              title={elementTitle}
            >
              on {elementTitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* AI Visible Toggle */}
          <button
            type="button"
            onClick={() => toggleAnnotationAiVisible(annotation.id)}
            title={annotation.aiVisible ? 'Visible to AI Copilot (Click to hide)' : 'Hidden from AI Copilot (Click to share)'}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              annotation.aiVisible
                ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            {annotation.aiVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="max-h-64 overflow-y-auto p-3 space-y-3 overscroll-contain">
        {annotation.messages.map((m, idx) => {
          const isAi = m.author === 'ai';
          return (
            <div key={m.id || idx} className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold flex items-center gap-1">
                  {isAi ? (
                    <>
                      <Sparkles className="size-2.5 text-blue-500 fill-blue-500" />
                      <span className="text-blue-600 dark:text-blue-400">Foqz AI</span>
                    </>
                  ) : (
                    <span>You</span>
                  )}
                </span>
                <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div
                className={`p-2.5 rounded-xl text-xs leading-relaxed break-words ${
                  isAi
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-zinc-800 dark:text-zinc-200'
                    : 'bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply Input Form */}
      <form onSubmit={handleSendReply} className="p-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1.5 bg-black/[0.02] dark:bg-white/[0.02]">
        <input
          type="text"
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Reply to thread..."
          className="flex-1 bg-transparent border-0 px-2 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!replyText.trim()}
          className="size-7 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          title="Send reply"
        >
          <Send className="size-3" />
        </button>
      </form>

      {/* Footer Actions */}
      <div className="px-3 py-2 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] bg-black/[0.01] dark:bg-white/[0.01]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleToggleStatus}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
          >
            {annotation.status === 'open' ? (
              <>
                <Check className="size-3 text-emerald-600" />
                <span>Resolve</span>
              </>
            ) : (
              <>
                <RotateCcw className="size-3" />
                <span>Reopen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleAskAi}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
            title="Ask AI Copilot about this annotation thread"
          >
            <Sparkles className="size-3" />
            <span>Ask AI</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => deleteAnnotation(annotation.id)}
          className="p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
          title="Delete annotation"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}
