import React, { useState, useEffect, useRef } from "react";
import { Terminal, CheckCircle2, AlertTriangle, Play, RefreshCw, Layers, ShieldCheck } from "lucide-react";
import { PipelineIteration } from "../types";

interface LoopConsoleProps {
  iterations: PipelineIteration[];
  isPipelineRunning: boolean;
  onTriggerRebuild: () => void;
  activeIterationIndex: number;
  setActiveIterationIndex: (index: number) => void;
}

export const LoopConsole: React.FC<LoopConsoleProps> = ({
  iterations,
  isPipelineRunning,
  onTriggerRebuild,
  activeIterationIndex,
  setActiveIterationIndex
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [iterations, activeIterationIndex]);

  const activeIteration = iterations[activeIterationIndex];

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full text-left">
      {/* Console Header */}
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase">2. AGENT SELF-CORRECTION TUNER</h2>
        </div>

        <button
          onClick={onTriggerRebuild}
          disabled={isPipelineRunning}
          className="flex items-center gap-1.5 px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-100 disabled:text-slate-400 rounded text-xs font-semibold text-white transition shadow-sm font-sans cursor-pointer"
          id="btn_trigger_pipeline"
        >
          {isPipelineRunning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>RUNNING...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>TRIGGER PIPELINE</span>
            </>
          )}
        </button>
      </div>

      {/* Iteration Selector Pill bar */}
      {iterations.length > 0 && (
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider">Pass:</span>
          <div className="flex items-center gap-1.5">
            {iterations.map((iter, idx) => {
              const active = idx === activeIterationIndex;
              const isSuccess = iter.status === "success";
              const isError = iter.status === "exec_error";
              
              let badgeColor = "border-amber-200 text-amber-705 bg-amber-50/50";
              if (isSuccess) badgeColor = "border-emerald-200 text-emerald-700 bg-emerald-50/10";
              if (isError) badgeColor = "border-red-200 text-red-650 bg-red-50/10";

              return (
                <button
                  key={iter.attempt}
                  onClick={() => setActiveIterationIndex(idx)}
                  className={`px-2.5 py-1 text-xs font-mono rounded border transition flex items-center gap-1.5 cursor-pointer ${
                    active 
                      ? "ring-1 ring-orange-500/30 border-orange-500 text-orange-700 bg-orange-50 font-semibold" 
                      : `hover:border-slate-300 ${badgeColor}`
                  }`}
                  id={`btn_iter_tab_${iter.attempt}`}
                >
                  <span>Round-{iter.attempt}</span>
                  {isSuccess ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  ) : isError ? (
                    <AlertTriangle className="w-3 h-3 text-red-500" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Iteration Console output (Terminal Logs) */}
      <div className="flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed min-h-[220px] flex flex-col justify-between border-t border-slate-200">
        {activeIteration ? (
          <div>
            {/* Round Status card */}
            <div className="mb-4 p-3 rounded-lg border flex items-center gap-3 bg-slate-900 border-slate-800">
              <div className="p-1.5 rounded bg-slate-950 border border-slate-850">
                {activeIteration.status === "success" ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : activeIteration.status === "exec_error" ? (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                )}
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider font-mono">Operation checkpoint</span>
                <span className="text-xs font-bold text-slate-100 uppercase font-sans tracking-wide">{activeIteration.stepName}</span>
              </div>
              <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-semibold border uppercase ${
                activeIteration.status === "success" 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : activeIteration.status === "exec_error"
                  ? "bg-red-500/10 text-red-400 border-red-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}>
                {activeIteration.status}
              </span>
            </div>

            {/* Terminal Streams */}
            <div className="whitespace-pre-wrap select-all selection:bg-slate-800 text-left">
              {activeIteration.logs.split("\n").map((line, lIdx) => {
                let colorClass = "text-slate-400";
                if (line.startsWith("[Sandbox Executor]") || line.includes("NameError") || line.includes("Traceback") || line.includes("failure")) {
                  colorClass = "text-red-400";
                } else if (line.startsWith("[Metrology Agent]") || line.includes("MATCH")) {
                  colorClass = "text-cyan-400";
                } else if (line.startsWith("[Comparison Agent]") || line.includes("FAIL")) {
                  colorClass = "text-amber-400";
                } else if (line.includes("SUCCESS") || line.includes("converged")) {
                  colorClass = "text-emerald-400";
                } else if (line.startsWith("[Perception Agent]") || line.startsWith("[Planning Agent]")) {
                  colorClass = "text-purple-400";
                } else if (line.startsWith("[Repair Agent]")) {
                  colorClass = "text-blue-400";
                }

                return (
                  <div key={lIdx} className={`${colorClass} py-0.5 border-l-2 border-slate-900 pl-2 leading-relaxed`}>
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
            <span className="text-xs font-semibold text-slate-500 uppercase font-sans tracking-wide">Sandbox Terminal Idle</span>
            <span className="text-[10px] text-slate-500 mt-1 max-w-sm font-sans">Trigger the pipeline to boot the CadQuery open-cascade executor agentic sequence. All repairs stream here.</span>
          </div>
        )}
      </div>
    </div>
  );
};
