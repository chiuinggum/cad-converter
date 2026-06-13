import React, { useEffect, useRef, useState } from "react";
import { History, RotateCcw, Clock } from "lucide-react";
import { WorkspaceHistoryEntry } from "../utils/workspaceStorage";

interface ChatHistoryMenuProps {
  entries: WorkspaceHistoryEntry[];
  onRestore: (entry: WorkspaceHistoryEntry) => void;
  disabled?: boolean;
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const ChatHistoryMenu: React.FC<ChatHistoryMenuProps> = ({
  entries,
  onRestore,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        title="Restore session history"
        disabled={disabled || entries.length === 0}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <History className="w-3.5 h-3.5" />
      </button>

      {open && entries.length > 0 && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-72 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Session history
            </p>
          </div>
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                onRestore(entry);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-orange-50/80 transition flex items-start gap-2 border-b border-slate-50 last:border-0"
            >
              <Clock className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-slate-800 truncate">
                  {entry.label}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">{formatWhen(entry.savedAt)}</p>
                <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
                  {entry.workspace.chatHistory?.length || 0} msgs ·{" "}
                  {entry.workspace.iterations?.length || 0} logs
                  {entry.workspace.glbUrl ? " · 3D" : ""}
                  {entry.workspace.drawingSpec ? " · spec" : ""}
                </p>
              </div>
              <RotateCcw className="w-3 h-3 text-orange-500 mt-1 shrink-0 opacity-70" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
