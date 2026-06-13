import React, { useState } from "react";
import { FileJson, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export interface DrawingSpecData {
  part_name?: string | null;
  drawing_number?: string | null;
  default_unit?: string;
  views?: Array<{ id: string; view_type: string; label?: string | null; description: string }>;
  dimensions?: Array<{
    id: string;
    dimension_type: string;
    value?: number | null;
    unit: string;
    applies_to: string;
    confidence?: number;
  }>;
  features?: Array<{
    id: string;
    feature_type: string;
    description: string;
    inferred?: boolean;
  }>;
  ambiguities?: Array<{ id: string; description: string; question: string }>;
  general_notes?: string[];
}

interface DrawingSpecPanelProps {
  spec: DrawingSpecData;
}

export const DrawingSpecPanel: React.FC<DrawingSpecPanelProps> = ({ spec }) => {
  const [showRaw, setShowRaw] = useState(false);
  const dims = spec.dimensions ?? [];
  const features = spec.features ?? [];
  const views = spec.views ?? [];
  const ambiguities = spec.ambiguities ?? [];

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col h-full overflow-hidden text-left min-h-0">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between shrink-0 bg-orange-50/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileJson className="w-4 h-4 text-orange-600 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">
              Drawing Spec
            </h2>
            <p className="text-[10px] text-slate-500 truncate">
              {spec.part_name || "Extracted from reference drawing"}
            </p>
          </div>
        </div>
        <span className="text-[9px] font-mono font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded uppercase shrink-0">
          Stage 1
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3 text-xs">
        <div className="flex flex-wrap gap-2 text-[10px] font-mono">
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {dims.length} dims
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {features.length} features
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
            {views.length} views
          </span>
          {spec.default_unit && (
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              unit: {spec.default_unit}
            </span>
          )}
        </div>

        {views.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Views
            </h3>
            <ul className="space-y-1">
              {views.map((v) => (
                <li key={v.id} className="text-[11px] text-slate-600 leading-snug">
                  <span className="font-mono text-slate-800">{v.view_type}</span>
                  {v.label ? ` · ${v.label}` : ""} — {v.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        {dims.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Dimensions
            </h3>
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <table className="w-full text-[10px]">
                <thead className="bg-slate-50 text-slate-500 font-mono">
                  <tr>
                    <th className="py-1 px-2 text-left">ID</th>
                    <th className="py-1 px-2 text-left">Value</th>
                    <th className="py-1 px-2 text-left">Applies to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {dims.map((d) => (
                    <tr key={d.id} className="text-slate-700">
                      <td className="py-1 px-2 font-mono text-slate-500">{d.id}</td>
                      <td className="py-1 px-2 font-mono">
                        {d.value != null ? d.value : "—"} {d.unit}
                      </td>
                      <td className="py-1 px-2">{d.applies_to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {features.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Features
            </h3>
            <ul className="space-y-1">
              {features.map((f) => (
                <li key={f.id} className="text-[11px] text-slate-600">
                  <span className="font-mono text-orange-700">{f.feature_type}</span> — {f.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        {ambiguities.length > 0 && (
          <section>
            <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Ambiguities
            </h3>
            <ul className="space-y-1.5">
              {ambiguities.map((a) => (
                <li key={a.id} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                  {a.question || a.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-slate-700 cursor-pointer"
        >
          {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Raw JSON
        </button>
        {showRaw && (
          <pre className="text-[9px] font-mono bg-slate-900 text-slate-300 p-2 rounded-lg overflow-x-auto max-h-40">
            {JSON.stringify(spec, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
