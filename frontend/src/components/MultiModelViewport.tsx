import React from "react";
import { Box, Download } from "lucide-react";
import { GLBViewer } from "./GLBViewer";

export interface ModelPreviewSlot {
  id: string;
  label: string;
  glbUrl: string;
}

interface MultiModelViewportProps {
  previews: ModelPreviewSlot[];
  activeId: string | null;
  onSelect: (id: string) => void;
  downloadUrls?: {
    glbUrl?: string | null;
    stlUrl?: string | null;
    stepUrl?: string | null;
    pyUrl?: string | null;
  };
}

export const MultiModelViewport: React.FC<MultiModelViewportProps> = ({
  previews,
  activeId,
  onSelect,
  downloadUrls,
}) => {
  const count = previews.length;
  const gridClass =
    count <= 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : "grid-cols-2 lg:grid-cols-3";

  const downloadLink = (label: string, url?: string | null) => {
    if (!url) return null;
    return (
      <a
        href={url}
        download
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
      >
        <Download className="w-3 h-3" />
        {label}
      </a>
    );
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full max-h-full overflow-hidden min-h-0">
      <div className="p-2.5 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="w-4 h-4 text-orange-600 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase truncate">
            3D VIEWPORT
          </h2>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            {count} window{count !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {downloadLink("GLB", downloadUrls?.glbUrl)}
          {downloadLink("STL", downloadUrls?.stlUrl)}
          {downloadLink("STEP", downloadUrls?.stepUrl)}
          {downloadLink("PY", downloadUrls?.pyUrl)}
        </div>
      </div>

      <div className={`flex-1 min-h-0 grid ${gridClass} gap-2 p-2 overflow-y-auto`}>
        {previews.map((slot) => {
          const active = slot.id === activeId;
          return (
            <div
              key={slot.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(slot.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(slot.id);
              }}
              className={`min-h-[200px] flex flex-col rounded-lg border overflow-hidden text-left transition cursor-pointer ${
                active
                  ? "border-orange-400 ring-2 ring-orange-200/80 shadow-sm"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div
                className={`px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide shrink-0 ${
                  active ? "bg-orange-50 text-orange-800" : "bg-slate-50 text-slate-600"
                }`}
              >
                {slot.label}
              </div>
              <div className="flex-1 min-h-0">
                <GLBViewer glbUrl={slot.glbUrl} compact hideDownloads />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
