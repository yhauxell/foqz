import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { CanvasIcon, useIconSet } from "@/components/CanvasIcon";
import { recentIcons, rememberIcon, searchIcons } from "@/lib/icons";

/** Searchable icon grid. Calls `onPick(name)`; `onRemove` shows a "Remove icon" action. */
export function IconPicker({
  onPick,
  onRemove,
  onClose,
}: {
  onPick: (name: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const set = useIconSet();
  const [query, setQuery] = useState("");
  const results = useMemo(() => (set ? searchIcons(set.names, query, 96) : []), [set, query]);
  const recents = useMemo(() => (set ? recentIcons().filter((n) => set.get(n)) : []), [set]);

  const pick = (name: string) => {
    rememberIcon(name);
    onPick(name);
  };

  return (
    <div className="w-[296px] flex flex-col gap-1.5 p-1.5" role="dialog" aria-label="Choose an icon">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && results[0]) pick(results[0]);
            else if (e.key === "Escape") onClose();
          }}
          placeholder="Search icons (rocket, database, user…)"
          aria-label="Search icons"
          className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 outline-none focus:ring-1 focus:ring-blue-500"
        />
        {onRemove && (
          <button
            type="button"
            title="Remove icon"
            aria-label="Remove icon"
            onClick={onRemove}
            className="size-7 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 cursor-pointer"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {!set ? (
        <div className="h-40 grid place-items-center text-[11px] text-zinc-400">Loading icons…</div>
      ) : (
        <>
          {!query && recents.length > 0 && (
            <>
              <div className="px-1 text-[10px] uppercase font-mono tracking-wider text-zinc-400">Recent</div>
              <Grid names={recents.slice(0, 8)} onPick={pick} />
            </>
          )}
          <div className="max-h-56 overflow-y-auto">
            {results.length ? (
              <Grid names={results} onPick={pick} />
            ) : (
              <div className="py-6 text-center text-[11px] text-zinc-400">No icons match “{query}”</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Grid({ names, onPick }: { names: string[]; onPick: (n: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {names.map((n) => (
        <button
          key={n}
          type="button"
          title={n}
          aria-label={`Icon ${n}`}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onPick(n)}
          className="size-8 rounded-md flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <CanvasIcon icon={n} size={16} />
        </button>
      ))}
    </div>
  );
}
