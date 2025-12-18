import { ChevronDown } from "lucide-react";
import Segmented from "./Segmented";

type TeamListRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  latest_version_num: number | null;
  is_active: number | null;
};

export type TeamFilterValue = "all" | "active" | { teamId: string };

type Props = {
  teams: TeamListRow[];
  activeTeam: TeamListRow | null;
  teamFilter: TeamFilterValue;
  onTeamFilterChange: (v: TeamFilterValue) => void;

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

function teamFilterToSelectValue(v: TeamFilterValue): string {
  if (v === "all") return "all";
  if (v === "active") return "active";
  return `team:${v.teamId}`;
}

function selectValueToTeamFilter(v: string): TeamFilterValue {
  if (v === "all") return "all";
  if (v === "active") return "active";
  if (v.startsWith("team:")) return { teamId: v.slice("team:".length) };
  return "all";
}

export default function BattlesFilterBar({
  teams,
  activeTeam,
  teamFilter,
  onTeamFilterChange,
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
      {/* Team selector */}
      <div className="relative">
        <select
          value={teamFilterToSelectValue(teamFilter)}
          onChange={(e) => onTeamFilterChange(selectValueToTeamFilter(e.target.value))}
          className="
            h-10 appearance-none
            rounded-2xl bg-white/70
            pl-3 pr-10 text-sm
            ring-1 ring-black/10
            focus:outline-none
            min-w-[280px]
          "
        >
          <option value="all">All teams</option>

          {teams.map((t) => (
            <option key={t.id} value={`team:${t.id}`}>
              {(t.name ?? "").trim() || "Unnamed team"}
              {t.format_ps ? ` · ${t.format_ps}` : ""}
              {t.latest_version_num != null ? ` · v${t.latest_version_num}` : ""}
              {t.is_active ? " · (Active)" : ""}
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