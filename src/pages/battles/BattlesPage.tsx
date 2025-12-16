import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import TeamSpriteStrip from "../../features/pokemon/ui/TeamSpriteStrip";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// Keep types local for now; we’ll move them to src/features/battles/types.ts once stable.
type BattleListItem = {
  id: string;
  playedAt: string; // ISO string or display string for now
  result: "win" | "loss";
  opponentName: string;
  format_ps?: string | null;
  rated?: boolean;
  teamLabel?: string | null; // linked team name if any
  teamVersionLabel?: string | null; // e.g. v1
  matchConfidence?: number | null; // 0..1
  matchMethod?: string | null; // 'species-only', 'exact-hash', ...
  brought?: Array<{ species: string; iconText?: string }>; // mock-friendly for now
};

type ActiveTeamSummary = {
  name: string;
  formatLabel?: string;
  versionLabel?: string;
};

type Props = {
  // optional overrides later (e.g. injecting data for storybook/tests)
  initialSelectedId?: string;
};

export function BattlesPage({ initialSelectedId }: Props) {
  // Temporary local mock data (move to src/features/battles/mocks.ts later)
  const activeTeam: ActiveTeamSummary = {
    name: "Top Rated (OTS)",
    formatLabel: "gen9vgc2025regH",
    versionLabel: "v1",
  };

    const rows = useMemo<BattleListItem[]>(() => [
    {
      id: "b1",
      playedAt: "16.12.2025",
      result: "win",
      opponentName: "Maximaster",
      format_ps: "gen9vgc2025regH",
      rated: true,
      teamLabel: "Top Rated (OTS)",
      teamVersionLabel: "v1",
      matchConfidence: 0.92,
      matchMethod: "species-only",
      brought: [
        { species: "Garchomp", iconText: "GA" },
        { species: "Flutter Mane", iconText: "FL" },
        { species: "Arcanine", iconText: "AR" },
        { species: "Togekiss", iconText: "TO" },
      ],
    },
    {
      id: "b2",
      playedAt: "16.12.2025",
      result: "win",
      opponentName: "Maximaster",
      format_ps: "gen9vgc2025regH",
      rated: false,
      teamLabel: "Top Rated (OTS)",
      teamVersionLabel: "v1",
      matchConfidence: 0.88,
      matchMethod: "species-only",
      brought: [
        { species: "Garchomp", iconText: "GA" },
        { species: "Amoonguss", iconText: "AM" },
        { species: "Arcanine", iconText: "AR" },
        { species: "Iron Hands", iconText: "IH" },
      ],
    },
    {
      id: "b3",
      playedAt: "15.12.2025",
      result: "loss",
      opponentName: "AshStar",
      format_ps: "gen9vgc2025regH",
      rated: true,
      teamLabel: null, // simulate unlinked battle
      teamVersionLabel: null,
      matchConfidence: null,
      matchMethod: null,
      brought: [
        { species: "Gholdengo", iconText: "GH" },
        { species: "Urshifu", iconText: "UR" },
        { species: "Rillaboom", iconText: "RI" },
        { species: "Tornadus", iconText: "TO" },
      ],
    },
  ], []);

  // UI state
  const [selectedId, setSelectedId] = useState<string>(
    initialSelectedId ?? rows[0]?.id ?? ""
  );
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "loss">("all");
  const [ratedOnly, setRatedOnly] = useState(false);
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((b) => {
      if (resultFilter !== "all" && b.result !== resultFilter) return false;
      if (ratedOnly && !b.rated) return false;
      if (formatFilter !== "all" && (b.format_ps ?? "") !== formatFilter) return false;

      if (!q) return true;
      const hay = [
        b.opponentName,
        b.format_ps ?? "",
        b.teamLabel ?? "",
        b.teamVersionLabel ?? "",
        b.matchMethod ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, query, resultFilter, ratedOnly, formatFilter]);

  const selected = useMemo(
    () => filtered.find((b) => b.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  // If the selected battle disappears due to filtering, reselect first
  React.useEffect(() => {
    if (!selected) return;
    // no-op, selected exists
  }, [selected]);

  React.useEffect(() => {
    if (!filtered.length) return;
    if (!filtered.some((b) => b.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  // Derived “header stats” for mock page
  const stats = useMemo(() => {
    const total = rows.length;
    const wins = rows.filter((r) => r.result === "win").length;
    const winrate = total ? Math.round((wins / total) * 100) : 0;
    const sortedDates = rows.map((r) => r.playedAt).sort();
    const lastPlayed = sortedDates.length
    ? sortedDates[sortedDates.length - 1]
    : "—";

    return { total, winrate, lastPlayed: lastPlayed ?? "—" };
  }, [rows]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.format_ps) set.add(r.format_ps);
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  function toggleExpanded(id: string) {
    setExpandedIds((m) => {
        const next = !m[id];
        return next ? { [id]: true } : {};
    });
    }

    return (
    <div className="w-full p-6">
      <div className="mx-auto flex w-full max-w-[1400px] min-h-[calc(100vh-64px)] flex-col gap-6">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-3xl font-semibold tracking-tight">Battle Reviews</div>
            <div className="mt-2 text-sm text-black/50">
              Review battles, link teams, and extract insights for coaching.
            </div>
          </div>

          <div className="flex items-center gap-5 rounded-3xl bg-white/40 px-4 py-3 ring-1 ring-black/5">
            <HeaderStat label="Battles" value={`${stats.total}`} />
            <HeaderStat label="Win rate" value={`${stats.winrate}%`} />
            <HeaderStat label="Last played" value={`${stats.lastPlayed}`} />
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search opponent, format, team…"
                className="h-10 w-72 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
              />
            </div>
          </div>
        </div>

        {/* Filter bar */}
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
            onChange={setResultFilter}
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
              onChange={(e) => setRatedOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Rated only</span>
          </label>

          <div className="relative flex-1 min-w-0">
            <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
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

        <div className="ml-auto text-sm text-black/40">
            {filtered.length} of {rows.length}
            </div>
        </div>

        {/* Main content (fills remaining height) */}
        <div className="grid flex-1 grid-cols-12 gap-6 items-stretch min-h-0">
          {/* Left list pane */}
          <div className="col-span-5 flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="text-sm font-semibold text-black/80">All formats</div>
              <button className="text-sm text-black/50 hover:text-black/70">
                Filter
              </button>
            </div>

            {/* Scroll region */}
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
              {filtered.length === 0 ? (
                <div className="rounded-3xl bg-white/70 p-6 text-sm text-black/55 ring-1 ring-black/10">
                  No battles match your filters.
                </div>
              ) : (
                <div className="overflow-hidden rounded-3xl bg-white/40 ring-1 ring-black/10">
                {filtered.map((b, idx) => (
                    <BattleRowCompact
                    key={b.id}
                    battle={b}
                    selected={b.id === selectedId}
                    onClick={() => setSelectedId(b.id)}
                    divider={idx !== filtered.length - 1}
                    expanded={!!expandedIds[b.id]}
                    onToggleExpanded={() => toggleExpanded(b.id)}
                    />
                ))}
                </div>
              )}
            </div>
          </div>

          {/* Right details pane */}
          <div className="col-span-7 flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
            <div className="min-h-0 flex-1 overflow-auto">
              {!selected ? (
                <div className="p-6 text-sm text-black/55">
                  Select a battle to review.
                </div>
              ) : (
                <BattleDetails battle={selected} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-xs text-black/40">{label}</div>
      <div className="text-sm font-semibold text-black/70">{value}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex items-center rounded-2xl bg-white/70 p-1 ring-1 ring-black/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-xl px-3 text-sm",
            value === o.value ? "bg-black/10 text-black" : "text-black/55 hover:text-black/75"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function BattleRowCompact({
  battle,
  selected,
  onClick,
  divider,
  expanded,
  onToggleExpanded
}: {
  battle: BattleListItem;
  selected: boolean;
  onClick: () => void;
  divider?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const isWin = battle.result === "win";

  return (
    <button
      onClick={onClick}
      className={cx(
        "w-full px-4 py-3 text-left transition",
        "hover:bg-white/55",
        selected && "bg-white/70",
        divider && "border-b border-black/5"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "h-2.5 w-2.5 rounded-full",
                isWin ? "bg-green-600" : "bg-red-500"
              )}
            />
            <div className="truncate text-sm font-semibold text-black/80">
              {isWin ? "Win" : "Loss"}{" "}
              <span className="text-black/35">vs</span>{" "}
              {battle.opponentName}
            </div>

            {battle.rated ? (
              <span className="ml-2 rounded-xl bg-black/5 px-2 py-0.5 text-[11px] text-black/55">
                Rated
              </span>
            ) : null}
          </div>

          <div className="mt-1 truncate text-xs text-black/55">
            {(battle.teamLabel ?? "Unlinked team") +
              (battle.teamVersionLabel ? ` · ${battle.teamVersionLabel}` : "")}
            {battle.matchConfidence != null ? (
              <span className="text-black/35">
                {" "}
                · Match: {battle.matchConfidence.toFixed(2)}
                {battle.matchMethod ? ` · ${battle.matchMethod}` : ""}
              </span>
            ) : null}
          </div>

          {/* Pokémon strip (optional, compact) */}
          {expanded && (
            <TeamSpriteStrip
                mons={battle.brought ?? []}
                size="sm"
                className="mt-2 min-h-[2.25rem]"
            />
            )}
        </div>

        {/* Right */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-xs text-black/45">{battle.playedAt}</div>

          {/* Expand / collapse chevron */}
            <button
            type="button"
            onClick={(e) => {
                e.stopPropagation(); // prevent selecting the row
                onToggleExpanded();
            }}
            className={cx(
                "flex h-9 w-9 items-center justify-center rounded-2xl",
                "bg-white/60 ring-1 ring-black/10 hover:bg-white/80 transition"
            )}
            aria-label={expanded ? "Collapse team preview" : "Expand team preview"}
            >
            <ChevronDown
            className={cx(
                "h-4 w-4 text-black/55 transition-transform duration-200",
                expanded ? "rotate-180" : "rotate-0"
            )}
            />
            </button>           
        </div>
      </div>
    </button>
  );
}

function BattleDetails({ battle }: { battle: BattleListItem }) {
  return (
    <div className="p-6">
      {/* Details header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-black/80">
            {battle.result === "win" ? "Win" : "Loss"} vs {battle.opponentName}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-black/55">
            <span className="inline-flex items-center gap-2">
              <span className={cx("h-2 w-2 rounded-full", battle.result === "win" ? "bg-green-600" : "bg-red-500")} />
              {battle.format_ps ?? "—"}
            </span>
            <span className="text-black/30">·</span>
            <span>{battle.rated ? "Rated" : "Unrated"}</span>
            <span className="text-black/30">·</span>
            <span>Played: {battle.playedAt}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="h-10 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 hover:bg-white/85">
            Replay
          </button>
          <button className="h-10 w-10 rounded-2xl bg-white/70 text-sm ring-1 ring-black/10 hover:bg-white/85">
            …
          </button>
        </div>
      </div>

      {/* Team vs Opponent */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-black/75">Your Team</div>
          <div className="mt-1 text-sm text-black/55">
            {battle.teamLabel ?? "Unlinked team"}
            {battle.teamVersionLabel ? ` · ${battle.teamVersionLabel}` : ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {battle.brought?.length ? (
            <TeamSpriteStrip
                mons={battle.brought}
                size="md"
                className="mt-3"
            />
            ) : (
            <div className="mt-3 text-xs text-black/45">
                No team preview available.
            </div>
            )}
          </div>
          {battle.matchConfidence != null ? (
            <div className="mt-3 text-xs text-black/45">
              Match: {battle.matchConfidence.toFixed(2)}
              {battle.matchMethod ? ` · ${battle.matchMethod}` : ""}
            </div>
          ) : (
            <div className="mt-3 text-xs text-black/45">
              Link this battle to a stored team to unlock coaching insights.
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-black/75">Opponent</div>
          <div className="mt-1 text-sm text-black/55">{battle.opponentName}</div>
          <div className="mt-3 text-xs text-black/45">
            Opponent team preview will appear here once parsed (mock later).
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
        <div className="text-sm font-semibold text-black/75">Timeline</div>
        <div className="mt-3 space-y-2 text-sm text-black/60">
          <TimelineRow label="Turn 1" text="Revealed leads (mock event)" />
          <TimelineRow label="Turn 3" text="First KO (mock event)" />
          <TimelineRow label="Turn 7" text="Victory condition reached (mock event)" />
        </div>
      </div>

      {/* AI Review */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
        <div className="text-sm font-semibold text-black/75">AI Review (coming soon)</div>
        <div className="mt-2 text-sm text-black/55">
          Tactical insights, pattern detection, and coaching suggestions will appear
          here once enough data is available.
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0 text-xs font-semibold text-black/45">{label}</div>
      <div className="flex-1">{text}</div>
    </div>
  );
}