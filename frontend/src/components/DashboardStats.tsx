import React from "react";
import { CheckCircle2, FileImage, Folder, LucideIcon } from "lucide-react";

export interface DashboardStatsData {
  totalFiles: number;
  folderCount: number;
  withResults: number;
  importedCount: number;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: LucideIcon;
  accent: "orange" | "sky" | "emerald";
}

const accentStyles = {
  orange: {
    bar: "bg-orange-500",
    iconWrap: "bg-orange-50 ring-orange-100",
    icon: "text-orange-600",
  },
  sky: {
    bar: "bg-sky-500",
    iconWrap: "bg-sky-50 ring-sky-100",
    icon: "text-sky-600",
  },
  emerald: {
    bar: "bg-emerald-500",
    iconWrap: "bg-emerald-50 ring-emerald-100",
    icon: "text-emerald-600",
  },
};

function StatCard({ label, value, hint, icon: Icon, accent }: StatCardProps) {
  const styles = accentStyles[accent];

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className={`absolute inset-y-0 left-0 w-1 ${styles.bar}`} />
      <div className="relative px-4 py-3 pl-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${styles.iconWrap}`}
          >
            <Icon className={`h-4 w-4 ${styles.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                {label}
              </p>
              <div className="shrink-0 font-sans text-2xl font-extrabold leading-none tracking-tight text-slate-900 tabular-nums">
                {value}
              </div>
            </div>
            <p className="mt-1 truncate text-[11px] leading-snug text-slate-500">{hint}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const DashboardStats: React.FC<{ stats: DashboardStatsData }> = ({ stats }) => {
  const { totalFiles, folderCount, withResults, importedCount } = stats;
  const pending = Math.max(totalFiles - withResults, 0);
  const completionPct =
    totalFiles > 0 ? Math.min(100, Math.round((withResults / totalFiles) * 100)) : 0;

  const filesHint =
    importedCount > 0
      ? `${importedCount} imported · ${totalFiles - importedCount} from examples`
      : "Drawings indexed across all folders";

  const foldersHint =
    totalFiles > 0
      ? `~${Math.max(1, Math.round(totalFiles / Math.max(folderCount, 1)))} files per folder on average`
      : "Create folders to organize your library";

  return (
    <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3 md:items-start">
      <StatCard
        label="Files"
        value={totalFiles}
        hint={filesHint}
        icon={FileImage}
        accent="orange"
      />

      <StatCard
        label="Folders"
        value={folderCount}
        hint={foldersHint}
        icon={Folder}
        accent="sky"
      />

      <StatCard
        label="With Results"
        value={
          <>
            {withResults}
            <span className="ml-0.5 text-base font-bold text-slate-400">/ {totalFiles}</span>
          </>
        }
        hint={
          pending > 0
            ? `${pending} pending · ${completionPct}% complete`
            : totalFiles > 0
              ? "All drawings have generated models"
              : "Run reconstruction to populate results"
        }
        icon={CheckCircle2}
        accent="emerald"
      />
    </div>
  );
};
