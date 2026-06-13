import React, { useState, useRef } from "react";
import { Upload, FileImage, Layers, RefreshCw, Sparkles } from "lucide-react";

interface DrawingExplorerProps {
  drawingTitle?: string;
  onCustomImageUploaded: (base64Image: string, mimeType: string) => void;
  onProcadGenerate: (prompt: string, image?: string, mimeType?: string) => void;
  examplePreviewUrl: string | null;
  isPerceiving: boolean;
  isPipelineRunning: boolean;
  pipelineStatusLabel?: string;
  promptText: string;
  onPromptChange: (text: string) => void;
}

export const DrawingExplorer: React.FC<DrawingExplorerProps> = ({
  drawingTitle,
  onCustomImageUploaded,
  onProcadGenerate,
  examplePreviewUrl,
  isPerceiving,
  isPipelineRunning,
  pipelineStatusLabel,
  promptText,
  onPromptChange,
}) => {
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [customMime, setCustomMime] = useState<string>("image/png");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayPreview = customPreview || examplePreviewUrl;
  const previewForGenerate = customPreview || examplePreviewUrl || undefined;
  const previewMime = customPreview
    ? customMime
    : examplePreviewUrl?.startsWith("data:")
      ? examplePreviewUrl.split(";")[0].replace("data:", "")
      : examplePreviewUrl?.endsWith(".jpg") || examplePreviewUrl?.endsWith(".jpeg")
        ? "image/jpeg"
        : examplePreviewUrl
          ? "image/png"
          : undefined;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid 2D technical drawing image (PNG, JPG).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setCustomPreview(base64);
      setCustomMime(file.type);
      onCustomImageUploaded(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full text-left min-h-0">
      <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-4 h-4 text-orange-600 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase truncate">
              2D DRAWING
            </h2>
            {drawingTitle && (
              <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{drawingTitle}</p>
            )}
          </div>
        </div>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
        <div className="flex flex-col gap-2 shrink-0">
          <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider font-semibold">
            CAD Prompt
          </label>
          <textarea
            value={promptText}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Describe the 3D part: dimensions, features, extrusion direction..."
            className="w-full h-[72px] text-xs font-sans p-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-orange-400 focus:ring-1 focus:ring-orange-200 outline-none resize-none"
          />
          <button
            type="button"
            disabled={!promptText.trim() || isPipelineRunning}
            onClick={() =>
              onProcadGenerate(
                promptText.trim(),
                previewForGenerate,
                previewForGenerate ? previewMime : undefined
              )
            }
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm text-white transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
              isPipelineRunning
                ? "bg-orange-500 pipeline-shimmer"
                : "bg-orange-600 hover:bg-orange-700"
            }`}
          >
            {isPipelineRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isPipelineRunning
              ? pipelineStatusLabel || "Generating…"
              : "Generate 3D Model (Pro-CAD)"}
          </button>
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between shrink-0">
            <label className="text-[11px] font-mono uppercase text-slate-400 tracking-wider font-semibold">
              Reference Drawing
            </label>
            {displayPreview && (
              <span className="text-[9px] font-mono text-cyan-700 bg-cyan-50 border border-cyan-100 px-1.5 py-0.5 rounded uppercase font-semibold">
                Active
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 bg-white rounded-lg overflow-hidden flex items-center justify-center p-2 border border-slate-200 shadow-sm relative">
            {displayPreview ? (
              <img
                src={displayPreview}
                alt="Drawing preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <FileImage className="w-8 h-8 text-slate-400 mb-2" />
                <span className="text-xs font-mono text-slate-600 font-semibold uppercase">No drawing</span>
                <span className="text-[10px] text-slate-500 mt-1 max-w-[200px]">
                  Open an example from Dashboard or upload your own blueprint.
                </span>
              </div>
            )}

            {isPerceiving && (
              <div className="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
                <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mb-3" />
                <span className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wide">Loading drawing…</span>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition flex flex-col items-center gap-1 ${
              dragOver
                ? "border-orange-500 bg-orange-50/50"
                : "border-slate-300 bg-slate-50 hover:bg-slate-100/70 hover:border-slate-400"
            }`}
            id="drag_drop_upload_zone"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span className="text-[10px] font-semibold font-sans text-slate-700">Upload blueprint (PNG, JPG)</span>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
