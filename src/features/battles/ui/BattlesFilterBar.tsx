import { ChevronDown } from "lucide-react";
import Segmented from "./Segmented";

type ActiveTeamSummary = {
  name: string;
  formatLabel?: string;
  versionLabel?: string;
};

type Props = {
  activeTeam: ActiveTeamSummary;

  resultFilter: "all" | "win" | "loss";
  onResultFilterChange: (v: "all" | "win" | "loss") => void;

  ratedOnly: boolean;
  onRatedOnlyChange: (v: boolean) => void;

  formatFilter: string;
  formats: string[];
  onFormatFilterChange: (v: string) => void;

  shownCount: number;
  totalCount: number;

  onOpenImport: () => void;
};

export default function BattlesFilterBar({
  activeTeam,
  resultFilter,
  onResultFilterChange,
  ratedOnly,
  onRatedOnlyChange,
  formatFilter,
  formats,
  onFormatFilterChange,
  shownCount,
  totalCount,
  onOpenImport,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white/50 p-3 ring-1 ring-black/5">
      {/* Active team selector (mock for now) */}
      <div className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm ring-1 ring-black/10">
        <span className="h-2 w-2 rounded-full bg-green-600" />
        <span className="font-medium">{activeTeam.name}</span>
        <span className="text-black/40">·</span>
        <span className="text-black/60">
          {activeTeam.formatLabel ?? "—"}{" "}
          {activeTeam.versionLabel ? `· ${activeTeam.versionLabel}` : ""}
        </span>
        <span className="text-black/30">▾</span>
      </div>

      <Segmented
        value={resultFilter}
        onChange={onResultFilterChange}
        options={[
          { value: "all", label: "All" },
          { value: "win", label: "Win" },
          { value: "loss", label: "Loss" },
        ]}
      />

      <label className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 text-sm ring-1 ring-black/10">
        <input
          type="checkbox"
          checked={ratedOnly}
          onChange={(e) => onRatedOnlyChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span>Rated only</span>
      </label>

      <div className="relative flex-1 min-w-0">
        <select
          value={formatFilter}
          onChange={(e) => onFormatFilterChange(e.target.value)}
          className="
            h-10 w-full appearance-none
            rounded-2xl bg-white/70
            pl-3 pr-10 text-sm
            ring-1 ring-black/10
            focus:outline-none
          "
        >
          {formats.map((f) => (
            <option key={f} value={f}>
              {f === "all" ? "All formats" : f}
            </option>
          ))}
        </select>

        <ChevronDown
          className="
            pointer-events-none
            absolute right-3 top-1/2
            h-4 w-4 -translate-y-1/2
            text-black/45
          "
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenImport}
          className="h-10 rounded-2xl cursor-pointer text-sage-50 bg-pine-700 px-4 text-sm font-semibold ring-1 ring-black/10 hover:bg-pine-500"
        >
          Import replays
        </button>
      </div>

      <div className="ml-auto text-sm text-black/40">
        {shownCount} of {totalCount}
      </div>
    </div>
  );
}