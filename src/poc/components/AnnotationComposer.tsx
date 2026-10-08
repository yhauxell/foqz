import React, { useState } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  X,
  Send,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { AnnotationKind } from '@/types/annotations';

interface AnnotationComposerProps {
  position: { x: number; y: number };
  targetNodeId: string | null;
  targetTitle?: string;
  onSave: (data: { body: string; kind: AnnotationKind; aiVisible: boolean }) => void;
  onCancel: () => void;
}

const KIND_OPTIONS: Array<{ kind: AnnotationKind; label: string; icon: React.ReactNode }> = [
  { kind: 'comment', label: 'Comment', icon: <MessageSquare className="size-3" /> },
  { kind: 'question', label: 'Question', icon: <HelpCircle className="size-3" /> },
  { kind: 'decision', label: 'Decision', icon: <Bookmark className="size-3" /> },
  { kind: 'constraint', label: 'Constraint', icon: <AlertCircle className="size-3" /> },
  { kind: 'todo', label: 'To-do', icon: <CheckCircle2 className="size-3" /> },
];

export function AnnotationComposer({
  position,
  targetNodeId,
  targetTitle,
  onSave,
  onCancel,
}: AnnotationComposerProps) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AnnotationKind>('comment');
  const [aiVisible, setAiVisible] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    onSave({ body: trimmed, kind, aiVisible });
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${Math.min(
          position.x,
          Math.max(10, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 320)
        )}px`,
        top: `${Math.min(
          position.y,
          Math.max(10, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240)
        )}px`,
        zIndex: 90,
      }}
      className="w-76 max-w-[calc(100%-2rem)] rounded-2xl glass-panel shadow-2xl border border-white/60 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl text-zinc-900 dark:text-zinc-100 p-3 flex flex-col gap-2.5 text-xs animate-in zoom-in-95 duration-150 select-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {targetNodeId ? `Annotate ${targetTitle || 'Element'}` : 'New Canvas Note'}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Kind selector pills */}
      <div className="flex items-center gap-1 flex-wrap">
        {KIND_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            onClick={() => setKind(opt.kind)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
              kind === opt.kind
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-2xs'
                : 'bg-black/[0.03] dark:bg-white/[0.04] text-zinc-600 dark:text-zinc-400 border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          autoFocus
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type annotation feedback, decisions, or questions..."
          className="w-full rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 p-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />

        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={() => setAiVisible(!aiVisible)}
            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
              aiVisible
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                : 'text-zinc-400 bg-black/5 dark:bg-white/5'
            }`}
            title={aiVisible ? 'Visible to AI Copilot context' : 'Hidden from AI Copilot'}
          >
            {aiVisible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
            <span>{aiVisible ? 'AI Context' : 'Hidden'}</span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 rounded-lg text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!body.trim()}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer shadow-2xs"
            >
              <Send className="size-3" />
              <span>Post</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
