import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  PracticeHeaderBar,
  PracticeScenarioDetailsPanel,
  PracticeScenarioListPanel,
} from "../../features/practice/ui";
import type {
  PracticeHeaderStats,
  PracticeScenarioDetails,
  PracticeScenarioListItem,
  PracticeTabKey,
} from "../../features/practice/model/practice.types";
import { PracticeApi } from "../../features/practice/api/practice.api";
import type { PracticeScenarioRow, PracticeScenarioTag, PracticeOutcomeRating, PracticeScenarioSource, PracticeScenarioStatus } from "../../features/practice/model/practice.types";

export type PracticeScenarioIntent = {
  battleId: string;
  turnNumber: number;
};

type BackendSnapshot = {
  game_type: "singles" | "doubles";
  user_side: "p1" | "p2" | null;

  actives: Record<
    SnapshotPosition,
    { species_name: string; hp_percent: number | null } | null
  >;

  bench: {
    p1: Array<{ species_name: string; hp_percent: number | null }>;
    p2: Array<{ species_name: string; hp_percent: number | null }>;
  };

  legal_moves: Record<
    SnapshotPosition,
    Array<{ move_name: string; disabled?: boolean; hint?: string }>
  >;

  legal_switches: Record<
    SnapshotPosition,
    Array<{ species_name: string }>
  >;
};

type SelectedAction =
  | { kind: "move"; moveName: string }
  | { kind: "switch"; speciesName: string };

type SnapshotPosition = "p1a" | "p1b" | "p2a" | "p2b";

const PRACTICE_TAGS = [
    "endgame",
    "midgame",
    "lead",
    "positioning",
    "speed_control",
    "risk",
  ] as const satisfies ReadonlyArray<PracticeScenarioTag>;

  const PRACTICE_TAG_SET = new Set<string>(PRACTICE_TAGS);
  function parseTagsJson(tags_json: string | null | undefined): PracticeScenarioTag[] {
    if (!tags_json) return [];
    try {
      const x: unknown = JSON.parse(tags_json);
      if (!Array.isArray(x)) return [];
      return x
        .filter((v): v is string => typeof v === "string")
        .filter((v) => PRACTICE_TAG_SET.has(v)) as PracticeScenarioTag[];
    } catch {
      return [];
    }
  }

type PracticeDetailsDto = {
  id: string;
  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;
  title: string;
  subtitle: string | null;
  description: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;
  user_side: "p1" | "p2" | null;

  tags_json: string;
  difficulty: number | null;

  attempts: Array<{
    id: string;
    created_at: string;
    rating: PracticeOutcomeRating;
    summary: string | null;
  }>;

  snapshot: BackendSnapshot | null;
};

function dtoToPracticeDetails(dto: PracticeDetailsDto): PracticeScenarioDetails {
  if (!dto.snapshot) {
    return {
      id: dto.id,
      title: dto.title,
      description: dto.description ?? dto.subtitle ?? null,
      source: dto.source,
      status: dto.status,
      format_id: dto.format_id ?? null,
      team_name: null,
      battle_id: dto.battle_id ?? null,
      turn_number: dto.turn_number ?? null,
      tags: parseTagsJson(dto.tags_json),

      user_side: {
        label: "You",
        active: {
          species_name: "Unknown",
          hp_percent: null,
          item_name: null,
          ability_name: null,
          moves: [],
        },
        bench: [],
      },

      opponent_side: {
        label: "Opponent",
        active: {
          species_name: "Unknown",
          hp_percent: null,
          item_name: null,
          ability_name: null,
          moves: [],
        },
        bench: [],
      },

      attempts: dto.attempts ?? [],
    };
  }

  const snap = dto.snapshot;

  const userSide: "p1" | "p2" = dto.user_side ?? snap.user_side ?? "p1";
  const oppSide: "p1" | "p2" = userSide === "p1" ? "p2" : "p1";

  // Prefer the “a” slot as the primary active (matches your current right panel shape)
  const primaryUserPos: SnapshotPosition = userSide === "p1" ? "p1a" : "p2a";
  const primaryOppPos: SnapshotPosition = oppSide === "p1" ? "p1a" : "p2a";

  const primaryUserActive = snap.actives[primaryUserPos];
  const primaryOppActive = snap.actives[primaryOppPos];

  const movesForPrimary = snap.legal_moves[primaryUserPos] ?? [];

  // For the current UI, show bench as “legal switches” for the primary position.
  const benchSwitches = snap.legal_switches[primaryUserPos] ?? [];

  return {
    id: dto.id,
    title: dto.title,
    description: dto.description ?? dto.subtitle ?? null,
    source: dto.source,
    status: dto.status,
    format_id: dto.format_id ?? null,
    team_name: null,
    battle_id: dto.battle_id ?? null,
    turn_number: dto.turn_number ?? null,
    tags: parseTagsJson(dto.tags_json),

    user_side: {
      label: "You",
      active: {
        species_name: primaryUserActive?.species_name ?? "Unknown",
        hp_percent: primaryUserActive?.hp_percent ?? null,
        item_name: null,
        ability_name: null,
        moves: movesForPrimary,
      },
      bench: benchSwitches.map((s) => ({ species_name: s.species_name, hp_percent: null })),
    },

    opponent_side: {
      label: "Opponent",
      active: {
        species_name: primaryOppActive?.species_name ?? "Unknown",
        hp_percent: primaryOppActive?.hp_percent ?? null,
        item_name: null,
        ability_name: null,
        moves: snap.legal_moves[primaryOppPos] ?? [],
      },
      bench: (oppSide === "p1" ? snap.bench.p1 : snap.bench.p2).map((b) => ({
        species_name: b.species_name,
        hp_percent: b.hp_percent ?? null,
      })),
    },

    attempts: dto.attempts ?? [],
  };
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeScenariosPage({
  initialIntent,
  onConsumedIntent,
}: {
  initialIntent?: PracticeScenarioIntent | null;
  onConsumedIntent?: () => void;
}) {
  const [tab, setTab] = useState<PracticeTabKey>("mine");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Action selection state (Part 1 + increment)
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(null);
  // Mock data for now (replace with DB later)
  const [mine, setMine] = useState<PracticeScenarioListItem[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
  const [mineError, setMineError] = useState<string | null>(null);

  const [details, setDetails] = useState<PracticeScenarioDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  type Difficulty = 1 | 2 | 3 | 4 | 5;
  function normalizeDifficulty(x: number | null | undefined): Difficulty | null {
    if (x == null) return null;
    if (x === 1 || x === 2 || x === 3 || x === 4 || x === 5) return x;
    return null;
  }

  function rowToListItem(r: PracticeScenarioRow): PracticeScenarioListItem {
    return {
      id: r.id,
      title: r.title,
      subtitle: r.subtitle ?? null,
      source: r.source,
      status: r.status,
      format_id: r.format_id ?? null,
      team_name: null, // hydrate later if you add joins
      battle_id: r.battle_id ?? null,
      turn_number: r.turn_number ?? null,
      tags: parseTagsJson(r.tags_json),
      attempts_count: r.attempts_count ?? 0,
      last_practiced_at: r.last_practiced_at
        ? new Date(r.last_practiced_at * 1000).toISOString()
        : null,
      best_rating: r.best_rating ?? null,
      difficulty: normalizeDifficulty(r.difficulty),
    };
  }

  const recommended: PracticeScenarioListItem[] = useMemo(
    () => [
      {
        id: "rec-1",
        title: "Lead Selection vs Hazard Stack",
        subtitle: "Identify the safest lead without losing early momentum.",
        source: "curated",
        status: "active",
        format_id: "gen9ou",
        team_name: null,
        battle_id: null,
        turn_number: null,
        tags: ["lead", "positioning"],
        attempts_count: 0,
        last_practiced_at: null,
        best_rating: null,
        difficulty: 2,
      },
      {
        id: "rec-2",
        title: "Speed Control Checkmate",
        subtitle: "Choose the move that preserves speed advantage.",
        source: "curated",
        status: "active",
        format_id: "gen9ou",
        team_name: null,
        battle_id: null,
        turn_number: null,
        tags: ["speed_control", "midgame"],
        attempts_count: 0,
        last_practiced_at: null,
        best_rating: null,
        difficulty: 4,
      },
    ],
    []
  );
  
  // Consume intent: create scenario + select + switch to "mine"
  const refreshMine = useCallback(async (preferredId?: string) => {
    setMineLoading(true);
    setMineError(null);
    try {
      const rows = await PracticeApi.listMyScenarios();
      const items = rows.map(rowToListItem);
      setMine(items);
      setSelectedId((prev) => preferredId ?? prev ?? items[0]?.id ?? null);
    } catch (e: unknown) {
      setMineError(e instanceof Error ? e.message : "Failed to load scenarios.");
    } finally {
      setMineLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMine();
  }, [refreshMine]);

  const consumedIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialIntent) return;

    const intentKey = `${initialIntent.battleId}::${initialIntent.turnNumber}`;

    // StrictMode guard (dev)
    if (consumedIntentRef.current === intentKey) {
      onConsumedIntent?.();
      return;
    }
    consumedIntentRef.current = intentKey;

    (async () => {
      try {
        // Source of truth: DB insert (idempotent via UNIQUE index)
        const row = await PracticeApi.createFromBattleTurn(
          initialIntent.battleId,
          initialIntent.turnNumber
        );

        // Refresh list from DB (prevents local duplicates)
        await refreshMine(row.id);

        setTab("mine");
        setSelectedAction(null);
      } catch (e: unknown) {
        window.__toast?.(
          e instanceof Error ? e.message : "Failed to create scenario.",
          "error"
        );
      } finally {
        onConsumedIntent?.();
      }
    })();
  }, [initialIntent, onConsumedIntent, refreshMine]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!selectedId) {
        setDetails(null);
        setDetailsError(null);
        setDetailsLoading(false);
        return;
      }

      setDetailsLoading(true);
      setDetailsError(null);

      try {
        const dto = await PracticeApi.getDetails(selectedId);
        console.log("[renderer] calling getDetails", selectedId);
        if (cancelled) return;

        if (!dto) {
          const row = await PracticeApi.getScenario(selectedId);
          if (cancelled) return;

          if (!row) {
            setDetails(null);
            setDetailsError("Scenario not found.");
            return;
          }

          setDetails({
            id: row.id,
            title: row.title,
            description: row.subtitle ?? null,
            source: row.source,
            status: row.status,
            format_id: row.format_id ?? null,
            team_name: null,
            battle_id: row.battle_id ?? null,
            turn_number: row.turn_number ?? null,
            tags: parseTagsJson(row.tags_json),
            user_side: {
              label: "You",
              active: { species_name: "Unknown", hp_percent: null, item_name: null, ability_name: null, moves: [] },
              bench: [],
            },
            opponent_side: {
              label: "Opponent",
              active: { species_name: "Unknown", hp_percent: null, item_name: null, ability_name: null, moves: [] },
              bench: [],
            },
            attempts: [],
          });

          setDetailsError("Snapshot not generated yet (showing basic scenario).");
          return;
        }

        // success path
        setDetails(dtoToPracticeDetails(dto as PracticeDetailsDto));
      } catch (e: unknown) {
        if (cancelled) return;
        setDetails(null);
        setDetailsError(e instanceof Error ? e.message : "Failed to load scenario details.");
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const allItems = tab === "mine" ? mine : recommended;

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return allItems.filter((x) => {
      if (formatFilter !== "all" && (x.format_id ?? "") !== formatFilter) return false;
      if (sourceFilter !== "all" && x.source !== sourceFilter) return false;

      if (!q) return true;

      const hay = [
        x.title,
        x.subtitle ?? "",
        x.format_id ?? "",
        x.team_name ?? "",
        (x.tags ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [allItems, query, formatFilter, sourceFilter]);

  const headerStats: PracticeHeaderStats = useMemo(() => {
    const items = mine;
    const scenariosTotal = items.length;

    const practiced = items.filter((x) => (x.attempts_count ?? 0) > 0);
    const successCount = items.filter((x) => x.best_rating === "better").length;
    const successRate =
      practiced.length > 0 ? Math.round((successCount / practiced.length) * 100) : 0;

    const dates = items
      .map((x) => x.last_practiced_at)
      .filter((x): x is string => Boolean(x))
      .sort();

    const last = dates.length > 0 ? dates[dates.length - 1] : null;
    const lastPracticed = last ? new Date(last).toLocaleDateString() : "—";

    return { scenariosTotal, successRate, lastPracticed };
  }, [mine]);

  const uniqueFormats = useMemo(() => {
    const set = new Set<string>();
    [...mine, ...recommended].forEach((x) => {
      if (x.format_id) set.add(x.format_id);
    });
    return Array.from(set).sort();
  }, [mine, recommended]);

  function handleNewScenario() {
    // MVP: no modal yet. Keep it simple.
    setTab("mine");
  }

  function handleSelectScenario(id: string) {
    setSelectedId(id);
    setSelectedAction(null);
  }

  function handleSelectMove(moveName: string) {
    setSelectedAction((prev) => {
      if (prev?.kind === "move" && prev.moveName === moveName) return null; // toggle
      return { kind: "move", moveName };
    });
  }

  function handleSelectSwitch(speciesName: string) {
    setSelectedAction((prev) => {
      if (prev?.kind === "switch" && prev.speciesName === speciesName) return null; // toggle
      return { kind: "switch", speciesName };
    });
  }

  function handleClearSelection() {
    setSelectedAction(null);
  }

  function handleRunOutcome() {
  if (!selectedAction || !details) return;
  console.log("Run outcome", { scenarioId: details.id, action: selectedAction });
}

  return (
    <div className="w-full p-6 h-full">
      <div className="flex h-full min-h-0 flex-col gap-5">
        <PracticeHeaderBar
          stats={headerStats}
          query={query}
          onQueryChange={setQuery}
          onNewScenario={handleNewScenario}
        />
        {mineLoading ? <div className="text-sm text-black/50">Loading scenarios…</div> : null}
        {mineError ? <div className="text-sm text-red-600">{mineError}</div> : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs tab={tab} onChange={(k) => {
            setTab(k);
            setSelectedAction(null);
          }} />

          <div className="flex items-center gap-2">
            <Select
              label="Format"
              value={formatFilter}
              onChange={setFormatFilter}
              options={[
                { value: "all", label: "All formats" },
                ...uniqueFormats.map((f) => ({ value: f, label: f })),
              ]}
            />
            <Select
              label="Source"
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: "all", label: "All sources" },
                { value: "battle_review", label: "From Battle Review" },
                { value: "team_drill", label: "From Team" },
                { value: "curated", label: "Curated" },
              ]}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <div className="grid h-full max-h-[calc(100vh-260px)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 h-full min-h-0">
              <PracticeScenarioListPanel
                title={tab === "mine" ? "My Scenarios" : "Recommended"}
                items={filteredItems}
                selectedId={selectedId}
                onSelect={handleSelectScenario}
              />
            </div>

            <div className="lg:col-span-7 h-full min-h-0">
              {detailsLoading ? <div className="text-sm text-black/50">Loading scenario…</div> : null}
              {detailsError ? <div className="text-sm text-red-600">{detailsError}</div> : null}
              <PracticeScenarioDetailsPanel
                details={details}
                selectedAction={selectedAction}
                onSelectMove={handleSelectMove}
                onSelectSwitch={handleSelectSwitch}
                onRunOutcome={handleRunOutcome}
                onClearSelection={handleClearSelection}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentedTabs({
  tab,
  onChange,
}: {
  tab: PracticeTabKey;
  onChange: (k: PracticeTabKey) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-white/70 p-1 shadow-sm">
      <SegTab active={tab === "mine"} onClick={() => onChange("mine")}>
        My Scenarios
      </SegTab>
      <SegTab active={tab === "recommended"} onClick={() => onChange("recommended")}>
        Recommended
      </SegTab>
    </div>
  );
}

function SegTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full px-4 py-2 text-sm font-medium",
        active ? "bg-emerald-900 text-white" : "text-slate-700 hover:bg-slate-100"
      )}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-2 text-sm shadow-sm">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}