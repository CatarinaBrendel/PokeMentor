import React, { useMemo, useState, useEffect } from "react";
import {
  BattlesHeaderBar,
  BattlesFilterBar,
  BattlesListPanel,
  BattleDetailsPanel,
  ImportReplaysModal,
} from "../../features/battles/ui";
import type { BattleListRow, BattleListItem } from "../../features/battles/model/battles.types";
import type { ImportReplaysResult, BattleDetailsDto } from "../../features/battles/model/battles.types";
import { BattlesApi } from "../../features/battles/api/batles.api";
import { TeamsApi } from "../../features/teams/api/teams.api";
import type { TeamListRow } from "../../features/teams/model/teams.types";


type ActiveTeamSummary = {
  name: string;
  formatLabel?: string;
  versionLabel?: string;
};

type TeamFilterValue = "all" | "active" | { teamId: string };

type Props = { initialSelectedId?: string };

function formatPlayedAt(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

function toUiRow(r: BattleListRow): BattleListItem {
  const result: BattleListItem["result"] =
    r.result === "win" || r.result === "loss" ? r.result : "unknown";

  const format_ps = r.format_id ?? r.format_name ?? null;

  const brought = safeJson<Array<{ species_name: string; is_lead: boolean }>>(
    r.user_brought_json,
    []
  );

  return {
    id: r.id,
    playedAtUnix: r.played_at,
    playedAt: formatPlayedAt(r.played_at),
    team_id: r.team_id ?? null,
    result,
    opponentName: r.opponent_name ?? "Unknown",
    format_ps,
    rated: r.is_rated === 1,

    userSide: r.user_side, // <-- HERE

    brought,

    broughtUserSeen: r.user_brought_seen ?? null,
    broughtUserExpected: r.user_brought_expected ?? null,
    broughtOpponentSeen: r.opponent_brought_seen ?? null,
    broughtOpponentExpected: r.opponent_brought_expected ?? null,
  };
}

export function BattlesPage({ initialSelectedId }: Props) {
  const [rows, setRows] = React.useState<BattleListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string>(initialSelectedId ?? "");
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "win" | "loss">("all");
  const [ratedOnly, setRatedOnly] = useState(false);
  const [formatFilter, setFormatFilter] = useState<string>("all");
  
  const [showImport, setShowImport] = useState(false);

  const [details, setDetails] = useState<BattleDetailsDto | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [teams, setTeams] = useState<TeamListRow[]>([]);
  const [activeTeam, setActiveTeam] = useState<TeamListRow | null>(null);
  const [teamFilter, setTeamFilter] = useState<TeamFilterValue>("all");


  async function refreshList() {
    try {
      setLoading(true);
      setError(null);

      // IMPORTANT: this should return BattleListRow[] (your SQL query output)
      const dbRows = (await BattlesApi.list({ limit: 200, offset: 0 })) as BattleListRow[];
      const uiRows = dbRows.map(toUiRow);

      setRows(uiRows);
      console.log("[ui] total rows:", uiRows.length, "linked:", uiRows.filter(r => r.team_id).length);
      setSelectedId((prev) => prev || uiRows[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function resolvedTeamId(
    teamFilter: TeamFilterValue,
    activeTeam: TeamListRow | null
  ): string | null {
    if (teamFilter === "all") return null;
    if (teamFilter === "active") return activeTeam?.id ?? null;
    return teamFilter.teamId;
  }

  useEffect(() => {
    refreshList();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const teamId = resolvedTeamId(teamFilter, activeTeam);

    return rows.filter((b) => {
      // ✅ team filter
      if (teamId && b.team_id !== teamId) return false;

      // existing filters
      if (resultFilter !== "all" && b.result !== resultFilter) return false;
      if (ratedOnly && !b.rated) return false;

      if (formatFilter !== "all") {
        const a = (b.format_ps ?? "").trim().toLowerCase();
        const f = formatFilter.trim().toLowerCase();
        if (a !== f) return false;
      }

      if (!q) return true;
      const hay = [b.opponentName, b.format_ps ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, resultFilter, ratedOnly, formatFilter, teamFilter, activeTeam]);

  const selected = useMemo(
    () => filtered.find((b) => b.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  useEffect(() => {
    if (!rows.length) return;

    // initial selection
    if (!selectedId) {
      setSelectedId(rows[0].id);
      return;
    }

    // selection no longer exists (e.g., deleted / refreshed list)
    if (!rows.some((b) => b.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (!selectedId) {
        setDetails(null);
        return;
      }

      setDetails(null);
      setDetailsLoading(true);
      try {
        const dto = await BattlesApi.getDetails(selectedId);
        if (!cancelled) setDetails(dto);
      } catch (e) {
        if (!cancelled) {
          setDetails(null);
          window.__toast?.("Failed to load battle details.", "error");
        }
      } finally {
        if (!cancelled) {
          setDetailsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    (async () => {
      const ts = await TeamsApi.listTeams();
      setTeams(ts);

      const activity = await TeamsApi.getActiveActivity();
      setActiveTeam(activity.activeTeam ?? null);

      if (!activity.activeTeam) setTeamFilter("all");
    })();
  }, []);

  useEffect(() => {
  if (!filtered.length) {
    setSelectedId("");
    return;
  }
  if (!selectedId || !filtered.some((b) => b.id === selectedId)) {
    setSelectedId(filtered[0].id);
  }
}, [filtered, selectedId]);

  const stats = useMemo(() => {
    const total = rows.length;
    const wins = rows.filter((r) => r.result === "win").length;
    const winrate = total ? Math.round((wins / total) * 100) : 0;

    const lastTs =
      rows
        .map((r) => r.playedAtUnix ?? 0)
        .reduce((a, b) => Math.max(a, b), 0) || null;

    const lastPlayed = lastTs ? formatPlayedAt(lastTs) : "—";
    return { total, winrate, lastPlayed };
  }, [rows]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const f = (r.format_ps ?? "").trim();
      if (f) set.add(f);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  return (
    <div className="w-full p-6">
      <div className="mx-auto flex w-full max-w-[1400px] min-h-[calc(100vh-64px)] flex-col gap-6">
        <BattlesHeaderBar stats={stats} query={query} onQueryChange={setQuery} />

        <BattlesFilterBar
          teams={teams}
          activeTeam={activeTeam}
          teamFilter={teamFilter}
          onTeamFilterChange={setTeamFilter}
          resultFilter={resultFilter}
          onResultFilterChange={setResultFilter}
          ratedOnly={ratedOnly}
          onRatedOnlyChange={setRatedOnly}
          formatFilter={formatFilter}
          formats={formats}
          onFormatFilterChange={setFormatFilter}
          shownCount={filtered.length}
          totalCount={rows.length}
          onOpenImport={() => setShowImport(true)}
        />

        <div className="grid flex-1 grid-cols-12 gap-6 items-stretch min-h-0">
          <div className="col-span-4 min-h-0">
            <BattlesListPanel
              items={filtered}
              selectedId={selectedId}
              loading={loading}
              error={error}
              onSelect={setSelectedId}
            />
          </div>

          <div className="col-span-8 min-h-0">
            <BattleDetailsPanel battle={selected} details={details} loading={detailsLoading} />
          </div>
        </div>
      </div>

      {showImport && (
        <ImportReplaysModal
          onClose={() => setShowImport(false)}
          onImported={(result: ImportReplaysResult) => {
            setShowImport(false);
            refreshList();

            window.__toast?.(
              result.failCount === 0
                ? `Imported ${result.okCount} replay(s).`
                : `Imported ${result.okCount}, failed ${result.failCount}.`,
              result.failCount === 0 ? "success" : "error"
            );
          }}
        />
      )}
    </div>
  );
}