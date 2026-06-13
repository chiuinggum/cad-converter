import React from "react";
import { Sliders, RefreshCw } from "lucide-react";
import { CadParam } from "../utils/cadParams";

interface SpecPanelProps {
  params: CadParam[];
  onParamChange: (paramId: string, value: number) => void;
  isUpdating?: boolean;
}

export const SpecPanel: React.FC<SpecPanelProps> = ({
  params,
  onParamChange,
  isUpdating = false,
}) => {
  if (params.length === 0) {
    return (
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full overflow-hidden text-left">
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Parameters</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-500">
          Generate a model to extract editable parameters from CadQuery code.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full overflow-hidden text-left">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Parameters</h2>
        </div>
        {isUpdating && (
          <span className="text-[10px] font-mono text-orange-600 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Updating 3D…
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {params.map((param) => (
          <div key={param.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-semibold text-slate-700 truncate">
                {param.label}
              </label>
              <div className="flex items-center gap-1 shrink-0">
                <input
                  type="number"
                  value={param.value}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (Number.isFinite(v)) onParamChange(param.id, v);
                  }}
                  className="w-16 text-right text-[11px] font-mono border border-slate-200 rounded px-1.5 py-0.5 focus:border-orange-400 outline-none"
                />
                <span className="text-[10px] text-slate-400 font-mono">{param.unit}</span>
              </div>
            </div>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={param.value}
              onChange={(e) => onParamChange(param.id, parseFloat(e.target.value))}
              className="w-full h-1.5 accent-orange-600 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-slate-400">
              <span>{param.min.toFixed(param.step < 0.1 ? 2 : 1)}</span>
              <span>{param.max.toFixed(param.step < 0.1 ? 2 : 1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
