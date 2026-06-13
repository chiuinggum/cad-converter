import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GripVertical,
  Layers,
  Loader2,
  Play,
} from "lucide-react";
import { ResolvedDrawingExample } from "../data/examples";
import { ExampleLibraryState } from "../utils/exampleLibraryStorage";

export interface BatchProgress {
  folderId: string;
  current: number;
  total: number;
  currentName: string;
}

interface DashboardLibraryProps {
  library: ExampleLibraryState;
  resolvedExamples: ResolvedDrawingExample[];
  selectedExampleId: string;
  searchTerm: string;
  partTypeFilter: string;
  batchProgress: BatchProgress | null;
  onLibraryChange: (patch: Partial<ExampleLibraryState>) => void;
  onSelectExample: (id: string) => void;
  onBatchRun: (folderId: string) => void;
  onOpenReconstruct: (id: string) => void;
}

function matchesFilter(
  ex: ResolvedDrawingExample,
  searchTerm: string,
  partTypeFilter: string
): boolean {
  const q = searchTerm.toLowerCase();
  const matchSearch =
    !q ||
    ex.name.toLowerCase().includes(q) ||
    ex.partType.toLowerCase().includes(q) ||
    ex.inputDrawing.toLowerCase().includes(q) ||
    ex.relativePath.toLowerCase().includes(q);
  const matchType = partTypeFilter === "All" || ex.partType === partTypeFilter;
  return matchSearch && matchType;
}

export const DashboardLibrary: React.FC<DashboardLibraryProps> = ({
  library,
  resolvedExamples,
  selectedExampleId,
  searchTerm,
  partTypeFilter,
  batchProgress,
  onLibraryChange,
  onSelectExample,
  onBatchRun,
  onOpenReconstruct,
}) => {
  const [dragItem, setDragItem] = useState<{
    folderId: string;
    exampleId: string;
  } | null>(null);

  const exampleMap = new Map(resolvedExamples.map((e) => [e.id, e]));

  const toggleFolder = (folderId: string) => {
    const expanded = new Set(library.expandedFolderIds);
    if (expanded.has(folderId)) expanded.delete(folderId);
    else expanded.add(folderId);
    onLibraryChange({ expandedFolderIds: Array.from(expanded) });
  };

  const reorderChild = (
    folderId: string,
    fromId: string,
    toId: string
  ) => {
    if (fromId === toId) return;
    const folders = library.folders.map((folder) => {
      if (folder.id !== folderId) return folder;
      const ids = [...folder.childIds];
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return folder;
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, fromId);
      return { ...folder, childIds: ids };
    });
    onLibraryChange({ folders });
  };

  const updatePath = (exampleId: string, relativePath: string) => {
    onLibraryChange({
      pathOverrides: { ...library.pathOverrides, [exampleId]: relativePath },
    });
  };

  const orderedFolders = library.folderOrder
    .map((id) => library.folders.find((f) => f.id === id))
    .filter(Boolean) as typeof library.folders;

  let visibleFileCount = 0;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse font-sans text-xs">
        <thead>
          <tr className="bg-[#f8fafc] border-b border-slate-200 text-slate-400 text-[10.5px] font-mono font-bold uppercase tracking-wider">
            <th className="py-3 px-4 w-8"></th>
            <th className="py-3 px-4">Name</th>
            <th className="py-3 px-4">Part Type</th>
            <th className="py-3 px-4">Asset Path</th>
            <th className="py-3 px-4">Preview</th>
            <th className="py-3 px-4 w-28">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {orderedFolders.map((folder) => {
            const expanded = library.expandedFolderIds.includes(folder.id);
            const children = folder.childIds
              .map((id) => exampleMap.get(id))
              .filter(Boolean) as ResolvedDrawingExample[];
            const visibleChildren = children.filter((ex) =>
              matchesFilter(ex, searchTerm, partTypeFilter)
            );
            const folderMatches =
              !searchTerm ||
              folder.name.toLowerCase().includes(searchTerm.toLowerCase());
            if (!folderMatches && visibleChildren.length === 0) return null;

            const isBatching =
              batchProgress?.folderId === folder.id && batchProgress.total > 0;
            visibleFileCount += visibleChildren.length;

            return (
              <React.Fragment key={folder.id}>
                <tr className="bg-slate-50/80 hover:bg-slate-100/60 transition">
                  <td className="py-2 px-4">
                    <button
                      type="button"
                      onClick={() => toggleFolder(folder.id)}
                      className="p-1 rounded hover:bg-white text-slate-500 cursor-pointer"
                      aria-label={expanded ? "Collapse folder" : "Expand folder"}
                    >
                      {expanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-800 tracking-tight">
                    <span className="flex items-center gap-2">
                      <Folder className="w-4 h-4 text-orange-600 shrink-0" />
                      {folder.name}
                      <span className="text-[10px] font-mono text-slate-400 font-normal">
                        ({children.length} files)
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 font-mono text-[10px]">
                    Folder
                  </td>
                  <td className="py-2.5 px-4 text-slate-400 font-mono text-[10px]">
                    wondercad/example/
                  </td>
                  <td className="py-2.5 px-4" />
                  <td className="py-2.5 px-4">
                    <button
                      type="button"
                      disabled={isBatching || children.length === 0}
                      onClick={() => onBatchRun(folder.id)}
                      className="inline-flex min-w-[5.75rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 font-semibold text-[10px] hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isBatching ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                      <span>
                        {isBatching
                          ? `${batchProgress!.current + 1}/${batchProgress!.total}`
                          : "Batch Run"}
                      </span>
                    </button>
                  </td>
                </tr>

                {isBatching && (
                  <tr className="bg-amber-50/40">
                    <td colSpan={6} className="py-2 px-4 text-[10px] text-amber-800 font-mono">
                      Running batch: {batchProgress!.currentName}…
                    </td>
                  </tr>
                )}

                {expanded &&
                  visibleChildren.map((ex) => {
                    const isSelected = ex.id === selectedExampleId;
                    const selectedCell =
                      "bg-orange-50/80 border-t-2 border-b-2 border-orange-300 first:border-l-[3px] first:border-l-orange-600 last:border-r-2 last:border-r-orange-300";
                    return (
                      <tr
                        key={ex.id}
                        draggable
                        onDragStart={() =>
                          setDragItem({ folderId: folder.id, exampleId: ex.id })
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (
                            dragItem &&
                            dragItem.folderId === folder.id &&
                            dragItem.exampleId !== ex.id
                          ) {
                            reorderChild(
                              folder.id,
                              dragItem.exampleId,
                              ex.id
                            );
                          }
                          setDragItem(null);
                        }}
                        onDragEnd={() => setDragItem(null)}
                        onClick={() => onSelectExample(ex.id)}
                        className={`transition cursor-pointer relative ${
                          isSelected ? "z-[1]" : "hover:bg-slate-50/70"
                        }`}
                      >
                        <td
                          className={`py-3 px-4 text-slate-300 ${
                            isSelected ? selectedCell : ""
                          }`}
                        >
                          <GripVertical className="w-4 h-4" />
                        </td>
                        <td
                          className={`py-3.5 px-4 font-bold text-slate-800 tracking-tight pl-6 ${
                            isSelected ? selectedCell : ""
                          }`}
                        >
                          {ex.name}
                        </td>
                        <td
                          className={`py-3.5 px-4 text-slate-500 font-medium ${
                            isSelected ? selectedCell : ""
                          }`}
                        >
                          {ex.partType}
                        </td>
                        <td
                          className={`py-3.5 px-4 ${isSelected ? selectedCell : ""}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ex.relativePath.startsWith("imported://") ? (
                            <span className="inline-flex items-center px-2 py-1.5 rounded bg-orange-50 border border-orange-100 font-mono text-[10px] text-orange-700">
                              Imported upload
                            </span>
                          ) : (
                            <input
                              type="text"
                              value={ex.relativePath}
                              onChange={(e) => updatePath(ex.id, e.target.value)}
                              className="w-full min-w-[200px] px-2 py-1.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600 focus:outline-none focus:border-orange-400"
                              title="Relative path under wondercad/example/"
                            />
                          )}
                        </td>
                        <td
                          className={`py-3.5 px-4 ${isSelected ? selectedCell : ""}`}
                        >
                          <img
                            src={ex.imageUrl}
                            alt={ex.name}
                            className={`w-12 h-12 rounded border object-cover bg-white ${
                              isSelected ? "border-orange-300" : "border-slate-200"
                            }`}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.opacity = "0.35";
                            }}
                          />
                        </td>
                        <td
                          className={`py-3.5 px-4 ${isSelected ? selectedCell : ""}`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReconstruct(ex.id);
                            }}
                            className="text-[10px] font-semibold text-orange-600 hover:text-orange-700 cursor-pointer"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="p-3 bg-[#f8fafc] border-t border-slate-200.5 flex items-center justify-between font-sans text-[11.5px] text-slate-500">
        <span>
          {visibleFileCount} drawing{visibleFileCount !== 1 ? "s" : ""} in{" "}
          {orderedFolders.length} folder{orderedFolders.length !== 1 ? "s" : ""}{" "}
          · drag rows to reorder · edit asset paths inline
        </span>
      </div>
    </div>
  );
};
