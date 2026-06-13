import React, { useEffect, useRef } from "react";
import { Terminal, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { PipelineIteration } from "../types";

interface LoopConsoleProps {
  iterations: PipelineIteration[];
  isPipelineRunning: boolean;
  activeIterationIndex: number;
  setActiveIterationIndex: (index: number) => void;
}

function shortStepLabel(stepName: string): string {
  const map: Record<string, string> = {
    "Drawing Spec Extract": "Spec",
    "CadQuery Generation": "Codegen",
    "Spec Validation": "Validate",
    "Execute & Export": "Export",
  };
  if (map[stepName]) return map[stepName];
  if (stepName.startsWith("Repair Attempt")) {
    return stepName.replace("Repair Attempt", "Fix");
  }
  if (stepName.startsWith("Spec Repair Attempt")) {
    return stepName.replace("Spec Repair Attempt", "SpecFix");
  }
  if (stepName.startsWith("Spec Format Repair")) {
    return stepName.replace("Spec Format Repair", "SpecFix");
  }
  return stepName.length > 18 ? `${stepName.slice(0, 16)}…` : stepName;
}

export const LoopConsole: React.FC<LoopConsoleProps> = ({
  iterations,
  isPipelineRunning,
  activeIterationIndex,
  setActiveIterationIndex,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const activeIteration = iterations[activeIterationIndex];

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [iterations, activeIterationIndex]);

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full min-h-0 text-left">
      <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-orange-600 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase truncate">
            Pipeline Log
          </h2>
        </div>
        {isPipelineRunning && (
          <span className="text-[9px] font-mono font-bold text-orange-600 uppercase flex items-center gap-1 shrink-0">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Live
          </span>
        )}
      </div>

      {iterations.length > 0 && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider shrink-0">
            Step:
          </span>
          <div className="flex items-center gap-1.5">
            {iterations.map((iter, idx) => {
              const active = idx === activeIterationIndex;
              const isSuccess = iter.status === "success";
              const isError = iter.status === "exec_error";

              let badgeColor = "border-amber-200 text-amber-700 bg-amber-50/50";
              if (isSuccess) badgeColor = "border-emerald-200 text-emerald-700 bg-emerald-50/10";
              if (isError) badgeColor = "border-red-200 text-red-600 bg-red-50/10";

              return (
                <button
                  key={`${iter.attempt}-${iter.stepName}-${idx}`}
                  onClick={() => setActiveIterationIndex(idx)}
                  title={iter.stepName}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition flex items-center gap-1.5 cursor-pointer max-w-[140px] ${
                    active
                      ? "ring-1 ring-orange-500/30 border-orange-500 text-orange-700 bg-orange-50 font-semibold"
                      : `hover:border-slate-300 ${badgeColor}`
                  }`}
                >
                  <span className="truncate">{shortStepLabel(iter.stepName)}</span>
                  {isSuccess ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                  ) : isError ? (
                    <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed min-h-0 flex flex-col border-t border-slate-200">
        {activeIteration ? (
          <div>
            <div className="mb-4 p-3 rounded-lg border flex items-center gap-3 bg-slate-900 border-slate-800">
              <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                {activeIteration.status === "success" ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : activeIteration.status === "exec_error" ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : activeIteration.status === "mismatch" ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                )}
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider font-mono">
                  Pipeline step
                </span>
                <span className="text-xs font-bold text-slate-100 font-sans tracking-wide truncate">
                  {activeIteration.stepName}
                </span>
              </div>
              <span
                className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold border uppercase shrink-0 ${
                  activeIteration.status === "success"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : activeIteration.status === "exec_error"
                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : activeIteration.status === "mismatch"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}
              >
                {activeIteration.status}
              </span>
            </div>

            <div className="whitespace-pre-wrap select-all selection:bg-slate-800 text-left">
              {activeIteration.logs.split("\n").map((line, lIdx) => {
                let colorClass = "text-slate-400";
                if (line.startsWith("[Drawing Agent]")) {
                  colorClass = "text-violet-400";
                } else if (line.startsWith("[Coder]")) {
                  colorClass = "text-blue-400";
                } else if (line.startsWith("[Sandbox]") || line.startsWith("[Exporter]")) {
                  colorClass = "text-cyan-400";
                } else if (line.startsWith("[Repair]")) {
                  colorClass = "text-amber-400";
                } else if (line.startsWith("[Spec Verify]")) {
                  colorClass = "text-fuchsia-400";
                } else if (
                  line.includes("Traceback") ||
                  line.includes("Error") ||
                  line.includes("failed")
                ) {
                  colorClass = "text-red-400";
                } else if (line.includes("SUCCESS") || line.includes("successfully")) {
                  colorClass = "text-emerald-400";
                }

                return (
                  <div
                    key={lIdx}
                    className={`${colorClass} py-0.5 border-l-2 border-slate-900 pl-2 leading-relaxed`}
                  >
                    {line}
                  </div>
                );
              })}
            </div>
            <div ref={terminalEndRef} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 h-full text-center">
            <Terminal className="w-8 h-8 text-slate-700 mb-2" />
            <span className="text-xs font-semibold text-slate-500 uppercase font-sans tracking-wide">
              Waiting for pipeline
            </span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-sm font-sans">
              Click Generate 3D Model — step logs from the agent will stream here.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
