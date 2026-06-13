import React, { useMemo, useState } from "react";
import {
  Boxes, Gauge, Repeat, CheckCircle2, XCircle, MinusCircle, FileImage,
  Search, ListChecks, ArrowUp, ArrowDown, ChevronsUpDown, Clock,
  ChevronLeft, ChevronRight, LayoutDashboard, Activity,
} from "lucide-react";

export interface RunHistoryItem {
  savedAt: string;
  label: string;
}

export interface RunRow {
  id: string;
  name: string;
  partType: string;
  imageUrl?: string;
  status: "success" | "failed" | "none";
  accuracy: number | null; // validation pass-rate %, null when never validated
  iterations: number;
  dimsPass: number;
  dimsTotal: number;
  lastRun: string | null;
  recent: RunHistoryItem[];
}

interface RunsViewProps {
  runs: RunRow[];
  onOpenRun: (id: string) => void;
  onOpenReconstruct: (id: string) => void;
}

type SortKey = "name" | "partType" | "status" | "accuracy" | "iterations" | "lastRun";

const PAGE_SIZE = 9;

const STATUS_META: Record<
  RunRow["status"],
  { label: string; cls: string; dot: string; icon: React.ReactNode }
> = {
  success: {
    label: "Success",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  failed: {
    label: "Failed",
    cls: "text-rose-700 bg-rose-50 border-rose-200",
    dot: "bg-rose-500",
    icon: <XCircle className="w-3 h-3" />,
  },
  none: {
    label: "Not run",
    cls: "text-slate-500 bg-slate-50 border-slate-200",
    dot: "bg-slate-300",
    icon: <MinusCircle className="w-3 h-3" />,
  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < day) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`;
  return fmtDate(iso);
}

const StatCard: React.FC<{
  label: string;
  value: string;
  hint: React.ReactNode;
  icon: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3">
    <div className="absolute inset-y-0 left-0 w-1 bg-orange-500/80" />
    <div className="flex items-center gap-3 pl-1">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 ring-1 ring-orange-100 text-orange-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            {label}
          </p>
          <span className="font-sans text-2xl font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
            {value}
          </span>
        </div>
        <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p>
      </div>
    </div>
  </div>
);

const SortHeader: React.FC<{
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  align?: "left" | "right";
}> = ({ label, col, sortKey, sortDir, onSort, align = "left" }) => (
  <th className={`py-2.5 px-3 font-bold ${align === "right" ? "text-right" : ""}`}>
    <button
      onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 hover:text-slate-700 transition ${
        align === "right" ? "flex-row-reverse" : ""
      } ${sortKey === col ? "text-orange-600" : ""}`}
    >
      {label}
      {sortKey === col ? (
        sortDir === "asc" ? (
          <ArrowUp className="w-3 h-3" />
        ) : (
          <ArrowDown className="w-3 h-3" />
        )
      ) : (
        <ChevronsUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  </th>
);

export const RunsView: React.FC<RunsViewProps> = ({
  runs,
  onOpenRun,
  onOpenReconstruct,
}) => {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | RunRow["status"]>("All");
  const [sortKey, setSortKey] = useState<SortKey>("lastRun");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const partTypes = useMemo(
    () => ["All", ...Array.from(new Set(runs.map((r) => r.partType))).sort()],
    [runs]
  );

  const toggleSort = (col: SortKey) => {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir(col === "name" || col === "partType" ? "asc" : "desc");
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusOrder = { success: 0, failed: 1, none: 2 };
    const rows = runs.filter((r) => {
      if (typeFilter !== "All" && r.partType !== typeFilter) return false;
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.partType.toLowerCase().includes(q))
        return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "partType":
          cmp = a.partType.localeCompare(b.partType);
          break;
        case "status":
          cmp = statusOrder[a.status] - statusOrder[b.status];
          break;
        case "accuracy":
          cmp = (a.accuracy ?? -1) - (b.accuracy ?? -1);
          break;
        case "iterations":
          cmp = a.iterations - b.iterations;
          break;
        case "lastRun":
          cmp =
            (a.lastRun ? new Date(a.lastRun).getTime() : 0) -
            (b.lastRun ? new Date(b.lastRun).getTime() : 0);
          break;
      }
      return cmp !== 0 ? cmp * dir : a.name.localeCompare(b.name);
    });
    return rows;
  }, [runs, query, typeFilter, statusFilter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const selected =
    runs.find((r) => r.id === selectedId) ??
    runs.find((r) => r.status === "success") ??
    runs[0] ??
    null;

  // Real aggregates (never fabricated).
  const reconstructed = runs.filter((r) => r.status === "success").length;
  const accs = runs.map((r) => r.accuracy).filter((a): a is number => a !== null);
  const avgAccuracy = accs.length
    ? Math.round(accs.reduce((s, a) => s + a, 0) / accs.length)
    : null;
  const iterRuns = runs.filter((r) => r.iterations > 0);
  const avgIterations = iterRuns.length
    ? (iterRuns.reduce((s, r) => s + r.iterations, 0) / iterRuns.length).toFixed(1)
    : null;
  const thisWeek = runs.filter(
    (r) =>
      r.status === "success" &&
      r.lastRun &&
      Date.now() - new Date(r.lastRun).getTime() < 7 * 86_400_000
  ).length;

  const pageIds = pageRows.map((r) => r.id);
  const allOnPageChecked = pageIds.length > 0 && pageIds.every((id) => checked.has(id));
  const toggleAllOnPage = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allOnPageChecked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full bg-[#f8fafc]">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex items-center gap-3">
        <ListChecks className="w-5 h-5 text-orange-600" />
        <h1 className="text-lg font-black text-slate-800 tracking-tight">Runs</h1>
        <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-slate-500 border border-slate-200 rounded px-2 py-0.5">
          {runs.length} projects
        </span>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search part or type…"
            className="text-xs border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:border-orange-400"
          />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Main column */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 p-3 overflow-hidden">
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
            <StatCard
              label="Total Projects"
              value={String(runs.length)}
              hint="Drawings in library"
              icon={<Boxes className="w-4 h-4" />}
            />
            <StatCard
              label="Reconstructed"
              value={runs.length ? `${reconstructed}/${runs.length}` : "—"}
              hint={
                thisWeek > 0 ? (
                  <span className="text-emerald-600 font-semibold">+{thisWeek} this week</span>
                ) : (
                  "Produced a 3D model"
                )
              }
              icon={<CheckCircle2 className="w-4 h-4" />}
            />
            <StatCard
              label="Avg Accuracy"
              value={avgAccuracy !== null ? `${avgAccuracy}%` : "—"}
              hint="Validation pass rate"
              icon={<Gauge className="w-4 h-4" />}
            />
            <StatCard
              label="Avg Iterations"
              value={avgIterations ?? "—"}
              hint="Agent loop rounds"
              icon={<Repeat className="w-4 h-4" />}
            />
          </div>

          {/* Table card */}
          <div className="flex-1 min-h-0 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col">
            {/* Filter bar */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50/60">
              {checked.size > 0 ? (
                <>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {checked.size} selected
                  </span>
                  <button
                    onClick={() => {
                      const first = filtered.find((r) => checked.has(r.id));
                      if (first) onOpenRun(first.id);
                    }}
                    className="text-[11px] font-bold text-orange-600 hover:text-orange-700"
                  >
                    Open first
                  </button>
                  <button
                    onClick={() => setChecked(new Set())}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-bold uppercase font-mono text-slate-400">
                    Filters
                  </span>
                  <select
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value);
                      setPage(0);
                    }}
                    className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-orange-400 cursor-pointer"
                  >
                    {partTypes.map((t) => (
                      <option key={t} value={t}>
                        {t === "All" ? "All types" : t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as typeof statusFilter);
                      setPage(0);
                    }}
                    className="text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-orange-400 cursor-pointer"
                  >
                    <option value="All">All statuses</option>
                    <option value="success">Success</option>
                    <option value="failed">Failed</option>
                    <option value="none">Not run</option>
                  </select>
                </>
              )}
              <span className="ml-auto text-[11px] text-slate-400 font-mono">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-[12px] border-collapse">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 text-[10px] uppercase font-mono z-10">
                  <tr className="border-b border-slate-200">
                    <th className="py-2.5 pl-4 pr-1 w-8">
                      <input
                        type="checkbox"
                        checked={allOnPageChecked}
                        onChange={toggleAllOnPage}
                        className="accent-orange-600 cursor-pointer"
                      />
                    </th>
                    <SortHeader label="Part" col="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Type" col="partType" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortHeader label="Accuracy" col="accuracy" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortHeader label="Iter" col="iterations" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <th className="py-2.5 px-3 font-bold text-right">Dims</th>
                    <SortHeader label="Last run" col="lastRun" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((r) => {
                    const meta = STATUS_META[r.status];
                    const isSel = selected?.id === r.id;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        onDoubleClick={() => onOpenRun(r.id)}
                        className={`cursor-pointer transition ${
                          isSel ? "bg-orange-50/50" : "hover:bg-slate-50/70"
                        }`}
                      >
                        <td className="py-2 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                            className="accent-orange-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 shrink-0 rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                              {r.imageUrl ? (
                                <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <FileImage className="w-4 h-4 text-slate-300" />
                              )}
                            </div>
                            <span className="font-semibold text-slate-700 truncate">{r.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-slate-500">{r.partType}</td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${meta.cls}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {r.accuracy !== null ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden hidden sm:inline-block">
                                <span
                                  className={`block h-full ${r.accuracy >= 100 ? "bg-emerald-500" : "bg-amber-400"}`}
                                  style={{ width: `${Math.min(100, r.accuracy)}%` }}
                                />
                              </span>
                              <span className="font-mono font-bold text-slate-700">{r.accuracy}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {r.iterations || "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {r.dimsTotal ? `${r.dimsPass}/${r.dimsTotal}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {fmtDate(r.lastRun)}
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-slate-400">
                        No runs match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-500">
              <span className="font-mono">
                {filtered.length === 0
                  ? "0 of 0"
                  : `${safePage * PAGE_SIZE + 1}–${Math.min(
                      filtered.length,
                      safePage * PAGE_SIZE + PAGE_SIZE
                    )} of ${filtered.length}`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono px-2">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="p-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer disabled:cursor-default"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Detail rail */}
        <aside className="shrink-0 w-[320px] border-l border-slate-200 bg-white overflow-y-auto hidden xl:flex flex-col">
          {selected ? (
            <div className="flex flex-col">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-800 truncate">{selected.name}</h3>
                <p className="text-[11px] text-slate-500">{selected.partType}</p>
              </div>

              {/* Input drawing */}
              <div className="px-4 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-1.5">
                  Input Drawing
                </p>
                <div className="aspect-[4/3] rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                  {selected.imageUrl ? (
                    <img src={selected.imageUrl} alt={selected.name} className="w-full h-full object-contain" />
                  ) : (
                    <FileImage className="w-8 h-8 text-slate-300" />
                  )}
                </div>
              </div>

              {/* Overview */}
              <div className="px-4 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-1.5">
                  Project Overview
                </p>
                <dl className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Status", STATUS_META[selected.status].label],
                    ["Accuracy", selected.accuracy !== null ? `${selected.accuracy}%` : "—"],
                    ["Iterations", selected.iterations ? String(selected.iterations) : "—"],
                    ["Dimensions", selected.dimsTotal ? `${selected.dimsPass}/${selected.dimsTotal}` : "—"],
                    ["Last run", fmtDate(selected.lastRun)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
                      <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400 font-mono">{k}</dt>
                      <dd className="font-bold text-slate-700 truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Recent runs */}
              <div className="px-4 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono mb-1.5">
                  Recent Runs
                </p>
                {selected.recent.length > 0 ? (
                  <ul className="space-y-1.5">
                    {selected.recent.map((h, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-1.5"
                      >
                        <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                        <span className="text-[11px] text-slate-600 truncate flex-1">{h.label}</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {fmtRelative(h.savedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-400">No saved runs yet.</p>
                )}
              </div>

              {/* Quick actions */}
              <div className="px-4 py-4 mt-auto space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Quick Actions
                </p>
                <button
                  onClick={() => onOpenRun(selected.id)}
                  className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs py-2.5 rounded-lg transition cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Open in Dashboard
                </button>
                <button
                  onClick={() => onOpenReconstruct(selected.id)}
                  className="w-full flex items-center justify-center gap-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs py-2.5 rounded-lg transition cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-orange-600" />
                  Open in Studio
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 pt-10 px-4">
              No runs yet. Reconstruct a drawing to see it here.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
