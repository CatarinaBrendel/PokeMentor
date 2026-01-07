import React from "react";
import type { PracticeHeaderStats } from "../../../features/practice/model/practice.types";

type PracticeHeaderBarProps = {
  stats: PracticeHeaderStats;

  query: string;
  onQueryChange: (next: string) => void;

  onNewScenario: () => void;

  // Optional: allow the caller to hide the KPI strip (useful while wiring data)
  showStats?: boolean;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeHeaderBar({
  stats,
  query,
  onQueryChange,
  onNewScenario,
  showStats = true,
}: PracticeHeaderBarProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight">Practice Scenarios</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Sharpen your battling skills by practicing specific scenarios.
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {showStats ? (
          <div className="flex items-center rounded-full border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
            <Stat label="Scenarios" value={String(stats.scenariosTotal)} />
            <Divider />
            <Stat label="Success rate" value={`${stats.successRate}%`} />
            <Divider />
            <Stat label="Last practiced" value={stats.lastPracticed} />
          </div>
        ) : null}

        <div className="flex items-center rounded-full border border-slate-200 bg-white/70 px-3 py-2 shadow-sm">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search scenario, tag, format, team…"
            className={cx(
              "w-[320px] bg-transparent text-sm outline-none",
              "placeholder:text-slate-400"
            )}
          />
        </div>

        <button
          type="button"
          onClick={onNewScenario}
          className={cx(
            "rounded-full px-5 py-2 text-sm font-medium",
            "bg-emerald-900 text-white",
            "hover:bg-emerald-800 active:bg-emerald-950",
            "shadow-sm"
          )}
        >
          New Scenario
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="mx-1 h-8 w-px bg-slate-200" />;
}