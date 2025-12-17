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

type ActiveTeamSummary = {
  name: string;
  formatLabel?: string;
  versionLabel?: string;
};

type Props = { initialSelectedId?: string };

function formatPlayedAt(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

function toUiRow(r: BattleListRow): BattleListItem {
  return {
    id: r.id,
    playedAt: formatPlayedAt(r.played_at),
    result: (r.result ?? "loss") as "win" | "loss", // or handle null differently
    opponentName: r.opponent_name ?? "Unknown",
    format_ps: r.format_id ?? r.format_name,
    rated: r.is_rated === 1,

    // placeholders for now
    teamLabel: null,
    teamVersionLabel: null,
    matchConfidence: null,
    matchMethod: null,
    brought: [],
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
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showImport, setShowImport] = useState(false);

  const [details, setDetails] = useState<BattleDetailsDto | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const activeTeam: ActiveTeamSummary = {
    name: "Active team (placeholder)",
    formatLabel: "—",
    versionLabel: "",
  };

  async function refreshList() {
    try {
      setLoading(true);
      setError(null);

      // IMPORTANT: this should return BattleListRow[] (your SQL query output)
      const dbRows = (await BattlesApi.list({ limit: 200, offset: 0 })) as BattleListRow[];
      const uiRows = dbRows.map(toUiRow);

      setRows(uiRows);
      setSelectedId((prev) => prev || uiRows[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

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

  useEffect(() => {
    if (!filtered.length) return;
    if (!filtered.some((b) => b.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
  let cancelled = false;

  async function load(): Promise<void> {
    if (!selectedId) {
      setDetails(null);
      return;
    }

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

  const stats = useMemo(() => {
    const total = rows.length;
    const wins = rows.filter((r) => r.result === "win").length;
    const winrate = total ? Math.round((wins / total) * 100) : 0;
    const sortedDates = rows.map((r) => r.playedAt).sort();
    const lastPlayed = sortedDates.length ? sortedDates[sortedDates.length - 1] : "—";
    return { total, winrate, lastPlayed };
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
        <BattlesHeaderBar stats={stats} query={query} onQueryChange={setQuery} />

        <BattlesFilterBar
          activeTeam={activeTeam}
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
          <BattlesListPanel
            rows={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            expandedIds={expandedIds}
            onToggleExpanded={toggleExpanded}
          />
          <BattleDetailsPanel battle={selected} details={details} />
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