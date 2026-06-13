import React, { useState, useRef } from "react";
import {
  Play, ChevronDown, FileText, ShieldCheck, Download, Upload,
  HelpCircle, Bell, CheckCircle2, XCircle, Wand2, Loader2, FileImage,
  PanelRightClose, PanelRightOpen, Maximize2, FileCode, Box,
} from "lucide-react";
import { DrawingSpecPanel, DrawingSpecData } from "./DrawingSpecPanel";
import { GLBViewer } from "./GLBViewer";
import { SpecPanel } from "./SpecPanel";
import { LoopConsole } from "./LoopConsole";
import { ChatPanel, ChatMessage } from "./ChatPanel";
import { ResizeHandle } from "./ResizeHandle";
import { useResizeWidth } from "../hooks/useResize";
import { PipelineIteration } from "../types";
import { CadParam } from "../utils/cadParams";
import { WorkspaceHistoryEntry } from "../utils/workspaceStorage";
import {
  PipelineMethod,
  PIPELINE_METHOD_ORDER,
  PIPELINE_METHOD_LABELS,
} from "../utils/pipelineSettings";

interface ExampleOption {
  id: string;
  name: string;
}

interface ActiveExample {
  name: string;
  partType: string;
  inputDrawing: string;
  imageUrl?: string;
}

interface DashboardWorkbenchProps {
  examples: ExampleOption[];
  selectedExampleId: string;
  onSelectExample: (id: string) => void;
  example: ActiveExample;
  examplePreviewUrl: string | null;

  drawingSpec: DrawingSpecData | null;
  glbUrl: string | null;
  stlUrl: string | null;
  stepUrl: string | null;
  pyUrl: string | null;

  iterations: PipelineIteration[];
  activeIterationIndex: number;
  setActiveIterationIndex: (index: number) => void;

  cadParams: CadParam[];
  onParamChange: (paramId: string, value: number) => void;
  isReexecuting: boolean;

  isPipelineRunning: boolean;
  pipelineActiveStep: number | null;
  pipelineStatusLabel: string;

  chatHistory: ChatMessage[];
  onSendMessage: (text: string, attachedImage?: string) => void;
  isChatResponding: boolean;
  historyEntries: WorkspaceHistoryEntry[];
  onRestoreHistory: (entry: WorkspaceHistoryEntry) => void;

  onRunReconstruction: () => void;
  onUpdateModel: () => void;
  onOpenReconstruct: () => void;

  pipelineMethod: PipelineMethod;
  onPipelineMethodChange: (method: PipelineMethod) => void;
  onUploadImage: (base64: string, mimeType: string, fileName: string) => void;
}

/** Numbered card chrome to match the dashboard mockup. */
const PanelCard: React.FC<{
  index: number;
  title: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ index, title, icon, right, bodyClassName, children }) => (
  <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full min-h-0 overflow-hidden text-left">
    <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-[10px] font-bold text-slate-500 font-mono">
          {index}
        </span>
        {icon}
        <h2 className="text-[12px] font-bold text-slate-700 tracking-wide font-sans uppercase truncate">
          {title}
        </h2>
      </div>
      {right}
    </div>
    <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName ?? "p-3"}`}>
      {children}
    </div>
  </div>
);

export const DashboardWorkbench: React.FC<DashboardWorkbenchProps> = ({
  examples,
  selectedExampleId,
  onSelectExample,
  example,
  examplePreviewUrl,
  drawingSpec,
  glbUrl,
  stlUrl,
  stepUrl,
  pyUrl,
  iterations,
  activeIterationIndex,
  setActiveIterationIndex,
  cadParams,
  onParamChange,
  isReexecuting,
  isPipelineRunning,
  pipelineActiveStep,
  pipelineStatusLabel,
  chatHistory,
  onSendMessage,
  isChatResponding,
  historyEntries,
  onRestoreHistory,
  onRunReconstruction,
  onUpdateModel,
  onOpenReconstruct,
  pipelineMethod,
  onPipelineMethodChange,
  onUploadImage,
}) => {
  const [chatOpen, setChatOpen] = useState(true);
  const chatResize = useResizeWidth(360, 280, 620);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) =>
      onUploadImage(ev.target?.result as string, file.type, file.name);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const inputImage = examplePreviewUrl || example.imageUrl || null;

  // Latest iteration that carries a dimension comparison drives the validation table.
  const validationIter = [...iterations]
    .reverse()
    .find((it) => it.comparison && it.comparison.length > 0);
  const comparison = validationIter?.comparison ?? [];
  const allPass = comparison.length > 0 && comparison.every((c) => c.ok);
  const maxError = comparison.reduce((m, c) => Math.max(m, c.error), 0);
  const passCount = comparison.filter((c) => c.ok).length;
  const healthPct = comparison.length
    ? Math.round((passCount / comparison.length) * 100)
    : null;

  const exports: Array<{
    label: string;
    url: string | null;
    recommended?: boolean;
    icon: React.ReactNode;
  }> = [
    { label: "STEP", url: stepUrl, recommended: true, icon: <FileCode className="w-4 h-4 text-sky-600" /> },
    { label: "STL", url: stlUrl, icon: <Box className="w-4 h-4 text-violet-600" /> },
    { label: "GLB", url: glbUrl, icon: <Box className="w-4 h-4 text-orange-600" /> },
  ];

  const runStatus = isPipelineRunning
    ? "Running"
    : glbUrl
      ? "Success"
      : "Idle";

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full bg-[#f8fafc]">
      {/* Top header bar */}
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex items-center">
            <select
              value={selectedExampleId}
              onChange={(e) => onSelectExample(e.target.value)}
              className="appearance-none bg-transparent text-xl font-black text-slate-800 tracking-tight pr-7 max-w-[280px] truncate focus:outline-none cursor-pointer"
              title="Switch project / drawing"
            >
              {examples.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          <span className="text-xs text-slate-400 font-medium">v0.1</span>
          <span className="ml-1 text-[10px] uppercase font-mono font-bold tracking-widest text-slate-500 border border-slate-200 bg-white rounded px-2 py-0.5">
            Validation Demo
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider hidden lg:inline">
              Pipeline
            </span>
            <div className="relative">
              <select
                value={pipelineMethod}
                onChange={(e) => onPipelineMethodChange(e.target.value as PipelineMethod)}
                title="Pipeline method (V3/V4 add dimension & visual validation)"
                className="appearance-none text-[11px] font-sans text-slate-700 border border-slate-200 rounded-lg pl-2.5 pr-7 py-1.5 bg-white focus:outline-none focus:border-orange-500 cursor-pointer max-w-[180px]"
              >
                {PIPELINE_METHOD_ORDER.map((method) => (
                  <option key={method} value={method}>
                    {PIPELINE_METHOD_LABELS[method].title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <button
            onClick={onRunReconstruction}
            disabled={isPipelineRunning}
            className="bg-[#ea580c] hover:bg-[#d97706] disabled:opacity-60 text-white font-bold text-xs px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition cursor-pointer"
          >
            {isPipelineRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isPipelineRunning ? "Running…" : "Run Reconstruction"}</span>
          </button>
          <button
            onClick={onOpenReconstruct}
            title="Open full Reconstruct studio"
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Body: workbench grid + collapsible chat sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Workbench grid */}
        <div
          className="flex-1 min-w-0 grid gap-3 p-3 min-h-0"
          style={{
            gridTemplateColumns: "repeat(3, minmax(0, 1fr)) minmax(220px, 290px)",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          }}
        >
          {/* 1 — INPUT DRAWING */}
          <PanelCard
            index={1}
            title="Input Drawing"
            icon={<FileText className="w-4 h-4 text-orange-600 shrink-0" />}
            right={
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[90px]">
                  {example.inputDrawing}
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload a different drawing"
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition cursor-pointer shrink-0"
                >
                  <Upload className="w-3 h-3" />
                  Upload
                </button>
              </div>
            }
            bodyClassName="p-2 flex items-center justify-center bg-[#f8fafc]"
          >
            {inputImage ? (
              <img
                src={inputImage}
                alt={example.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center text-slate-400 hover:text-orange-600 p-4 cursor-pointer transition"
              >
                <FileImage className="w-8 h-8 mb-2" />
                <span className="text-[10px] font-mono">No drawing — click to upload</span>
              </button>
            )}
          </PanelCard>

          {/* 2 — SPEC MANIFEST */}
          <div className="min-h-0 overflow-hidden">
            {drawingSpec ? (
              <DrawingSpecPanel spec={drawingSpec} />
            ) : (
              <PanelCard
                index={2}
                title="Spec Manifest"
                icon={<FileText className="w-4 h-4 text-orange-600 shrink-0" />}
              >
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-400">
                  Run a reconstruction to extract the spec manifest from the drawing.
                </div>
              </PanelCard>
            )}
          </div>

          {/* 3 — 3D MODEL VIEWER */}
          <div className="min-h-0 overflow-hidden">
            {glbUrl ? (
              <GLBViewer
                glbUrl={glbUrl}
                stlUrl={stlUrl || undefined}
                stepUrl={stepUrl || undefined}
                pyUrl={pyUrl || undefined}
                title="3D Model Viewer"
              />
            ) : (
              <PanelCard
                index={3}
                title="3D Model Viewer"
                icon={<Box className="w-4 h-4 text-orange-600 shrink-0" />}
              >
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <Box className="w-10 h-10 text-slate-300 mb-2" />
                  <span className="text-xs font-semibold text-slate-500">
                    3D viewport ready
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 max-w-[200px]">
                    Run reconstruction to build the CadQuery model.
                  </span>
                </div>
              </PanelCard>
            )}
          </div>

          {/* 7 — PARAMETERS (spans both rows on the far column) */}
          <div
            className="min-h-0 flex flex-col gap-2 overflow-hidden"
            style={{ gridColumn: 4, gridRow: "1 / span 2" }}
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <SpecPanel
                params={cadParams}
                onParamChange={onParamChange}
                isUpdating={isReexecuting}
              />
            </div>
            <div className="shrink-0 space-y-2">
              <button
                onClick={onUpdateModel}
                disabled={cadParams.length === 0 || isReexecuting}
                className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 py-2.5 rounded-lg font-bold text-white text-xs tracking-wide transition cursor-pointer"
              >
                {isReexecuting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>Update Model</span>
              </button>
              {glbUrl && (
                <div className="flex items-center justify-between text-[10px] font-mono px-1">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" />
                    {isReexecuting ? "Updating…" : "Model updated"}
                  </span>
                  <span className="text-slate-400">
                    {isReexecuting ? "" : "Just now"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 4 — VALIDATION (DIMENSION CHECK) */}
          <PanelCard
            index={4}
            title="Validation (Dimension Check)"
            icon={<ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" />}
            bodyClassName="p-0 flex flex-col"
          >
            {comparison.length > 0 ? (
              <>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left font-mono text-[11px] border-collapse">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10px]">
                      <tr className="border-b border-slate-200">
                        <th className="py-2 px-3 font-bold">param_id</th>
                        <th className="py-2 px-3 font-bold text-right">target</th>
                        <th className="py-2 px-3 font-bold text-right">measured</th>
                        <th className="py-2 px-3 font-bold text-right">error</th>
                        <th className="py-2 px-3 font-bold text-center">status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {comparison.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/60">
                          <td className="py-1.5 px-3 font-bold text-slate-700">{c.id}</td>
                          <td className="py-1.5 px-3 text-right text-slate-600">{c.target.toFixed(1)}</td>
                          <td className="py-1.5 px-3 text-right font-bold text-slate-800">{c.measured.toFixed(1)}</td>
                          <td className={`py-1.5 px-3 text-right font-bold ${c.error > 0.05 ? "text-amber-600" : "text-emerald-600"}`}>
                            {c.error === 0 ? "0.00" : `+${c.error.toFixed(2)}`}
                          </td>
                          <td className="py-1.5 px-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${c.ok ? "text-emerald-700" : "text-amber-700"}`}>
                              {c.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {c.ok ? "Pass" : "Fail"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`shrink-0 flex items-center justify-between px-3 py-2 text-[11px] border-t ${allPass ? "bg-emerald-50/70 border-emerald-100 text-emerald-700" : "bg-amber-50/70 border-amber-100 text-amber-700"}`}>
                  <span className="flex items-center gap-1.5 font-semibold">
                    {allPass ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {allPass ? `All ${comparison.length} dimensions validated` : "Dimensions out of tolerance"}
                  </span>
                  <span className="font-mono">Max error: {maxError.toFixed(2)} mm</span>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-400">
                Awaiting dimension scan. Run a reconstruction to validate.
              </div>
            )}
          </PanelCard>

          {/* 5 — AGENT LOOP */}
          <div className="min-h-0 overflow-hidden">
            <LoopConsole
              iterations={iterations}
              isPipelineRunning={isPipelineRunning}
              activeIterationIndex={activeIterationIndex}
              setActiveIterationIndex={setActiveIterationIndex}
            />
          </div>

          {/* 6 — EXPORT */}
          <PanelCard
            index={6}
            title="Export"
            icon={<Download className="w-4 h-4 text-orange-600 shrink-0" />}
          >
            <p className="text-[11px] text-slate-500 mb-3">Export the validated model</p>
            <div className="space-y-2">
              {exports.map((ex) => (
                <a
                  key={ex.label}
                  href={ex.url || undefined}
                  download={ex.url ? true : undefined}
                  aria-disabled={!ex.url}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition ${
                    ex.url
                      ? "border-slate-200 bg-white hover:bg-slate-50 cursor-pointer"
                      : "border-slate-100 bg-slate-50/60 opacity-50 pointer-events-none"
                  }`}
                >
                  {ex.icon}
                  <span className="text-xs font-bold text-slate-700">{ex.label}</span>
                  {ex.recommended && (
                    <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      Recommended
                    </span>
                  )}
                  {ex.url && healthPct !== null && (
                    <span
                      title="Dimensional health (validation pass rate)"
                      className={`ml-auto text-[10px] font-bold font-mono ${
                        allPass ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {healthPct}%
                    </span>
                  )}
                  <Download
                    className={`w-3.5 h-3.5 text-slate-400 ${
                      ex.url && healthPct !== null ? "ml-2" : "ml-auto"
                    }`}
                  />
                </a>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
              All exports use the current model and parameters.
            </p>
          </PanelCard>
        </div>

        {/* Collapse / expand rail */}
        <button
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? "Collapse Co-Pilot" : "Expand Co-Pilot"}
          className="shrink-0 w-8 border-l border-slate-200 bg-white hover:bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-orange-600 transition cursor-pointer"
        >
          {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          {!chatOpen && (
            <span
              className="text-[10px] font-bold uppercase tracking-widest text-slate-400"
              style={{ writingMode: "vertical-rl" }}
            >
              Co-Pilot
            </span>
          )}
        </button>

        {/* Resizable, collapsible chat sidebar */}
        {chatOpen && (
          <>
            <ResizeHandle side="left" onMouseDown={chatResize.startResize("left")} />
            <aside
              className="shrink-0 border-l border-slate-200 bg-white p-3 min-h-0 overflow-hidden"
              style={{ width: chatResize.width }}
            >
              <ChatPanel
                chatHistory={chatHistory}
                onSendMessage={onSendMessage}
                isChatResponding={isChatResponding}
                pipelineActiveStep={pipelineActiveStep}
                pipelineRunning={isPipelineRunning}
                historyEntries={historyEntries}
                onRestoreHistory={onRestoreHistory}
              />
            </aside>
          </>
        )}
      </div>

      {/* Bottom status bar */}
      <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-2 flex items-center justify-between text-[11px] font-sans text-slate-500">
        <div className="flex items-center gap-4">
          <span>
            Project: <span className="font-semibold text-slate-700">{example.name}</span>
          </span>
          <span className="h-3 w-px bg-slate-200" />
          <span>
            Part: <span className="font-semibold text-slate-700">{example.partType}</span>
          </span>
          <span className="h-3 w-px bg-slate-200" />
          <span className="flex items-center gap-1.5">
            Status:
            {runStatus === "Running" ? (
              <span className="flex items-center gap-1 font-semibold text-orange-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                {pipelineStatusLabel || "Running"}
              </span>
            ) : runStatus === "Success" ? (
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <CheckCircle2 className="w-3 h-3" /> Success
              </span>
            ) : (
              <span className="font-semibold text-slate-500">Idle</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Units: <span className="font-semibold text-slate-700">mm</span></span>
          <span className="h-3 w-px bg-slate-200" />
          <span>Tolerance: <span className="font-semibold text-slate-700">±0.05 mm</span></span>
        </div>
      </footer>
    </div>
  );
};
