import React, { useMemo } from 'react';
import {
  MessageSquare,
  HelpCircle,
  Bookmark,
  AlertCircle,
  CheckCircle2,
  Check,
  Eye,
  EyeOff,
  Filter,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Annotation, AnnotationKind } from '@/types/annotations';
import { useFlowCanvasStore } from '@/poc/store/flowCanvasStore';

interface AnnotationsPanelProps {
  onSelectNode?: (nodeId: string) => void;
  onSelectAnnotation?: (annotationId: string) => void;
}

export function AnnotationsPanel({
  onSelectNode,
  onSelectAnnotation,
}: AnnotationsPanelProps) {
  const [filterStatus, setFilterStatus] = React.useState<'open' | 'resolved' | 'all'>('open');
  const [filterKind, setFilterKind] = React.useState<AnnotationKind | 'all'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const nodes = useFlowCanvasStore((s) => s.nodes);
  const annotations = useFlowCanvasStore((s) => s.annotations);
  const setActiveAnnotationId = useFlowCanvasStore((s) => s.setActiveAnnotationId);
  const toggleAnnotationAiVisible = useFlowCanvasStore((s) => s.toggleAnnotationAiVisible);

  const annotationList = useMemo(() => {
    const list = Object.values(annotations);
    return list.filter((a) => {
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterKind !== 'all' && a.kind !== filterKind) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesBody = a.messages.some((m) => m.body.toLowerCase().includes(q));
        return matchesBody;
      }
      return true;
    });
  }, [annotations, filterStatus, filterKind, searchQuery]);

  const handleItemClick = (ann: Annotation) => {
    setActiveAnnotationId(ann.id);
    if (onSelectAnnotation) {
      onSelectAnnotation(ann.id);
    }
    if (ann.anchor.nodeId && onSelectNode) {
      onSelectNode(ann.anchor.nodeId);
      window.dispatchEvent(
        new CustomEvent('foqz:flow-center-on', { detail: { id: ann.anchor.nodeId } })
      );
    }
  };

  const openCount = Object.values(annotations).filter((a) => a.status === 'open').length;
  const resolvedCount = Object.values(annotations).filter((a) => a.status === 'resolved').length;

  return (
    <div className="flex flex-col h-full text-zinc-900 dark:text-zinc-100 text-xs select-none">
      {/* Top Filter Bar */}
      <div className="p-3 border-b border-black/[0.06] dark:border-white/[0.08] space-y-2 bg-black/[0.02] dark:bg-white/[0.02]">
        {/* Search */}
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search annotations..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-black/5 dark:border-white/5 text-xs placeholder:text-zinc-400 focus:outline-none"
          />
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterStatus('open')}
            className={`px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
              filterStatus === 'open'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Open ({openCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('resolved')}
            className={`px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
              filterStatus === 'resolved'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Resolved ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`px-2 py-0.5 rounded-full font-medium transition-colors cursor-pointer ${
              filterStatus === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 overscroll-contain">
        {annotationList.length === 0 ? (
          <div className="py-12 text-center text-zinc-400 text-xs">
            No annotations found
          </div>
        ) : (
          annotationList.map((ann) => {
            const rootMsg = ann.messages[0];
            const targetNode = ann.anchor.nodeId
              ? nodes.find((n) => n.id === ann.anchor.nodeId)
              : null;
            const targetTitle = (targetNode?.data as any)?.title || (targetNode?.data as any)?.label || targetNode?.type || 'Canvas';
            const hasAiReply = ann.messages.some((m) => m.author === 'ai');

            return (
              <div
                key={ann.id}
                onClick={() => handleItemClick(ann)}
                className="p-2.5 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer space-y-1 group"
              >
                <div className="flex items-center justify-between text-[10px] text-zinc-500">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-semibold uppercase text-zinc-700 dark:text-zinc-300">
                      {ann.kind}
                    </span>
                    <span className="truncate max-w-[120px] text-zinc-400">
                      on {targetTitle}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {ann.aiVisible && (
                      <span title="Included in AI Context">
                        <Sparkles className="size-2.5 text-blue-500 fill-blue-500" />
                      </span>
                    )}
                    <span>{ann.messages.length} msg</span>
                  </div>
                </div>

                <div className="text-xs text-zinc-800 dark:text-zinc-200 line-clamp-2 leading-relaxed">
                  {rootMsg ? rootMsg.body : 'Annotation thread'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
