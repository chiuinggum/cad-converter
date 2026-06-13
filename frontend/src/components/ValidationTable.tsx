import React from "react";
import { CheckCircle2, XCircle, ShieldCheck, Download, Copy, Code, Check } from "lucide-react";
import { ComparisonResult } from "../types";

interface ValidationTableProps {
  comparisonList: ComparisonResult[];
  cadQueryCode: string;
  onCopyCode: () => void;
  isCopied: boolean;
}

export const ValidationTable: React.FC<ValidationTableProps> = ({
  comparisonList,
  cadQueryCode,
  onCopyCode,
  isCopied
}) => {
  const allClear = comparisonList.length > 0 && comparisonList.every((item) => item.ok);

  const triggerDownload = (fileName: string, content: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full text-left">
      {/* Table Title Header bar */}
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase">3. METROLOGY SCANNER & CAD DEPLOYER</h2>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        {/* Metrology Certification Card */}
        {allClear ? (
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-3 shadow-2xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5 animate-bounce" />
            <div className="flex-1 text-left">
              <h4 className="text-xs font-bold text-emerald-800 font-sans uppercase tracking-wider">Metrology Tolerance Scan Passed</h4>
              <p className="text-[10px] text-slate-600 font-sans mt-0.5 leading-relaxed">
                Reconstructed CAD model topology fully aligns with Blueprint Ground Truth parameters. Overall geometric variance measures strictly within tolerance limits (<span className="text-emerald-700 font-bold font-mono">&lt; 0.05 mm</span>).
              </p>
            </div>
          </div>
        ) : comparisonList.length > 0 ? (
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 shadow-2xs">
            <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-left">
              <h4 className="text-xs font-bold text-amber-800 font-sans uppercase tracking-wider">Calibration Incomplete</h4>
              <p className="text-[10px] text-slate-600 font-sans mt-0.5 leading-relaxed">
                Metrology agent found structural alignment discrepancies. Initiating downstream corrections...
              </p>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 bg-slate-50/50 font-sans text-xs">
            Awaiting inspection scans. Trigger pipeline above.
          </div>
        )}

        {/* Dynamic Verification Matrix Table */}
        {comparisonList.length > 0 && (
          <div className="flex flex-col">
            <span className="text-[10px] font-mono text-slate-450 uppercase tracking-wider mb-2 font-bold">TOLERANCE COMPLIANCE MATRIX</span>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/50 shadow-inner">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-500 text-[10px]">
                    <th className="p-2.5 font-bold text-slate-500">DIM_ID</th>
                    <th className="p-2.5 font-bold text-slate-500 text-right">TARGET</th>
                    <th className="p-2.5 font-bold text-slate-500 text-right">MEASURED</th>
                    <th className="p-2.5 font-bold text-slate-500 text-right">ERROR</th>
                    <th className="p-2.5 font-bold text-slate-500 text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {comparisonList.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/50 transition ${
                        item.ok ? "text-slate-600" : "text-amber-700 font-bold bg-amber-50/20"
                      }`}
                    >
                      <td className="p-2.5 font-bold text-slate-700">{item.id}</td>
                      <td className="p-2.5 text-right">{item.target.toFixed(2)}mm</td>
                      <td className="p-2.5 text-right font-bold text-slate-800">
                        {item.measured.toFixed(2)}mm
                      </td>
                      <td className={`p-2.5 text-right font-bold ${item.error > 0.05 ? "text-amber-650" : "text-emerald-600"}`}>
                        {item.error === 0 ? "0.00" : `+${item.error.toFixed(2)}`}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          item.ok
                            ? "bg-emerald-50 text-emerald-700 border-emerald-250"
                            : "bg-amber-50 text-amber-700 border-amber-250 animate-pulse"
                        }`}>
                          {item.ok ? "PASS" : "FAIL"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CAD Exports Section */}
        <div className="mt-auto border-t border-slate-100 pt-4">
          <span className="text-[10px] font-mono text-slate-450 uppercase tracking-wider mb-2 block font-bold">PARAMETRIC EXPORTS</span>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => triggerDownload("model.step", cadQueryCode)}
              disabled={!allClear}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-650 disabled:opacity-40 hover:text-slate-800 hover:bg-slate-50 hover:border-slate-350 font-bold rounded-lg text-xs transition shadow-2xs font-sans cursor-pointer"
              id="btn_export_step"
            >
              <Download className="w-3.5 h-3.5 text-orange-600" />
              <span>DOWNLOAD .STEP</span>
            </button>
            <button
              onClick={() => triggerDownload("model.stl", cadQueryCode)}
              disabled={!allClear}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-650 disabled:opacity-40 hover:text-slate-800 hover:bg-slate-50 hover:border-slate-350 font-bold rounded-lg text-xs transition shadow-2xs font-sans cursor-pointer"
              id="btn_export_stl"
            >
              <Download className="w-3.5 h-3.5 text-orange-600" />
              <span>DOWNLOAD .STL</span>
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-slate-405 px-1">
              <div className="flex items-center gap-1 font-semibold">
                <Code className="w-3 h-3 text-orange-500" />
                <span>source: model.py</span>
              </div>
              <span className="font-semibold text-[10px]">CadQuery Source (OCCT)</span>
            </div>
            
            <div className="relative rounded-lg border border-slate-800 bg-slate-950 p-2 text-[10px] font-mono text-slate-400 overflow-x-auto max-h-[140px] text-left leading-normal whitespace-pre">
              {cadQueryCode}
              <button
                onClick={onCopyCode}
                className="absolute top-2 right-2 p-1.5 bg-slate-900 border border-slate-800 rounded-md text-slate-400 hover:text-white hover:border-slate-700 transition cursor-pointer"
                title="Copy Code"
                id="btn_copy_cq_code"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
