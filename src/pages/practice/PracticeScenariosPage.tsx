import React, { useMemo, useState } from "react";
import {
  PracticeHeaderBar,
  PracticeScenarioDetailsPanel,
  PracticeScenarioListPanel,
} from "./ui";
import type {
  PracticeScenarioDetails,
  PracticeScenarioListItem,
  PracticeTabKey,
} from "./model/practice.types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeScenariosPage() {
  const [tab, setTab] = useState<PracticeTabKey>("mine");
  const [query, setQuery] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Mock data for now (replace with real data from DB later)
  const mine: PracticeScenarioListItem[] = useMemo(
    () => [
      {
        id: "scn-1",
        title: "Manage the Endgame (Dragonite)",
        subtitle: "Choose a line that converts advantage without risking a throw.",
        source: "battle_review",
        status: "active",
        format_id: "gen9ou",
        team_name: "Balance v3",
        battle_id: "btl-001",
        turn_number: 18,
        tags: ["endgame", "risk", "positioning"],
        attempts_count: 3,
        last_practiced_at: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
        best_rating: "better",
        difficulty: 2,
      },
      {
        id: "scn-2",
        title: "Punish Over-switching",
        subtitle: "Hold tempo by committing to the right midgame line.",
        source: "battle_review",
        status: "draft",
        format_id: "gen9ou",
        team_name: "HO v1",
        battle_id: "btl-008",
        turn_number: 7,
        tags: ["midgame", "positioning"],
        attempts_count: 0,
        last_practiced_at: null,
        best_rating: null,
        difficulty: 3,
      },
    ],
    []
  );

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

  const selectedDetails: PracticeScenarioDetails | null = useMemo(() => {
    if (!selectedId) return null;

    const base = [...mine, ...recommended].find((x) => x.id === selectedId);
    if (!base) return null;

    // Minimal mock “details” to render the right panel.
    return {
      id: base.id,
      title: base.title,
      description:
        base.subtitle ??
        "Practice this scenario by choosing a move or switch and evaluating the outcome.",
      source: base.source,
      status: base.status,
      format_id: base.format_id ?? null,
      team_name: base.team_name ?? null,
      battle_id: base.battle_id ?? null,
      turn_number: base.turn_number ?? null,
      tags: base.tags ?? [],
      user_side: {
        label: "You",
        active: {
          species_name: "Dragonite",
          hp_percent: 74,
          item_name: "Heavy-Duty Boots",
          ability_name: "Multiscale",
          moves: [
            { move_name: "Dragon Dance" },
            { move_name: "Extreme Speed" },
            { move_name: "Earthquake" },
            { move_name: "Roost" },
          ],
        },
        bench: [
          { species_name: "Gholdengo", hp_percent: 33 },
          { species_name: "Tusk", hp_percent: 81 },
          { species_name: "Rotom-W", hp_percent: 59 },
        ],
      },
      opponent_side: {
        label: "Opponent",
        active: {
          species_name: "Kingambit",
          hp_percent: 62,
          item_name: "Black Glasses",
          ability_name: "Supreme Overlord",
          moves: [
            { move_name: "Kowtow Cleave", disabled: true, hint: "Hidden to MVP" },
            { move_name: "Sucker Punch", disabled: true, hint: "Hidden to MVP" },
            { move_name: "Iron Head", disabled: true, hint: "Hidden to MVP" },
            { move_name: "Swords Dance", disabled: true, hint: "Hidden to MVP" },
          ],
        },
        bench: [
          { species_name: "Great Tusk", hp_percent: 40 },
          { species_name: "Gliscor", hp_percent: 12 },
        ],
      },
      attempts: base.attempts_count
        ? [
            {
              id: "att-1",
              created_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
              rating: "neutral",
              summary: "Extreme Speed → traded HP but kept tempo",
            },
            {
              id: "att-2",
              created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
              rating: "better",
              summary: "Roost → stabilized and forced the switch",
            },
          ]
        : [],
    };
  }, [selectedId, mine, recommended]);

  const headerStats = useMemo(() => {
    const items = mine; // “stats” should represent *your* practice activity
    const scenariosTotal = items.length;

    const practiced = items.filter((x) => x.attempts_count && x.attempts_count > 0);
    const successCount = items.filter((x) => x.best_rating === "better").length;

    const successRate =
      practiced.length > 0 ? Math.round((successCount / practiced.length) * 100) : 0;

    const dates = items
      .map((x) => x.last_practiced_at)
      .filter(Boolean)
      .sort()
      
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
    // MVP: no modal yet; we can add later.
    // For now, select the first item to keep it feeling responsive.
    if (filteredItems.length > 0) setSelectedId(filteredItems[0].id);
  }

  return (
    <div className="w-full p-6 h-full">
      <div className="flex flex-col gap-5">
        <PracticeHeaderBar
          stats={headerStats}
          query={query}
          onQueryChange={setQuery}
          onNewScenario={handleNewScenario}
        />

        {/* Tabs + Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs tab={tab} onChange={setTab} />

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

        {/* Main layout */}
        <div className="flex-1 min-h-0">
          <div className="grid h-full max-h-[calc(100vh-260px)] min-h-0 grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5 h-full min-h-0">
              <PracticeScenarioListPanel
                title={tab === "mine" ? "My Scenarios" : "Recommended"}
                items={filteredItems}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>

            <div className="lg:col-span-7 h-full min-h-0">
              <PracticeScenarioDetailsPanel details={selectedDetails} />
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