import React from "react";
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";
import type { PracticeScenarioListItem } from "../model/practice.types";

type PracticeScenarioListPanelProps = {
  title?: string;
  items: PracticeScenarioListItem[];

  selectedId: string | null;
  onSelect: (id: string) => void;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeScenarioListPanel({
  title = "Scenarios",
  items,
  selectedId,
  onSelect,
}: PracticeScenarioListPanelProps) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <div className="text-xs text-slate-500">{items.length}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cx(
                    "w-full rounded-lg border px-3 py-3 text-left",
                    "transition-colors",
                    selectedId === s.id
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {s.title}
                      </div>

                      {s.subtitle ? (
                        <div className="mt-0.5 truncate text-xs text-slate-600">
                          {s.subtitle}
                        </div>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Pill>
                          {sourceLabel(s.source)}
                          {s.turn_number ? ` · Turn ${s.turn_number}` : ""}
                        </Pill>

                        {s.format_id ? <Pill>{s.format_id}</Pill> : null}
                        {s.team_name ? <Pill>{s.team_name}</Pill> : null}

                        <StatusPill status={s.status} />
                      </div>
                    </div>

                    {typeof s.difficulty === "number" ? (
                      <div className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {difficultyLabel(s.difficulty)}
                      </div>
                    ) : null}
                  </div>

                  {/* Optional team preview strip */}
                  {/* Only render when you have team sprite data available */}
                  {/* If you store it later, add `team_preview` to PracticeScenarioListItem */}
                  {/* <div className="mt-3">
                    <TeamSpriteStrip pokemon={...} />
                  </div> */}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <div className="text-sm font-medium text-slate-700">No scenarios yet</div>
      <div className="mt-1 max-w-xs text-xs text-slate-500">
        Create one from a battle turn, or explore recommended drills.
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: PracticeScenarioListItem["status"] }) {
  const map: Record<
    PracticeScenarioListItem["status"],
    { label: string; cls: string }
  > = {
    draft: { label: "Draft", cls: "bg-slate-100 text-slate-700" },
    active: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
    archived: { label: "Archived", cls: "bg-slate-100 text-slate-500" },
  };

  const v = map[status];

  return (
    <span
      className={cx(
        "rounded-full px-2.5 py-1 text-xs font-medium",
        v.cls
      )}
    >
      {v.label}
    </span>
  );
}

function sourceLabel(src: PracticeScenarioListItem["source"]) {
  switch (src) {
    case "battle_review":
      return "From Battle Review";
    case "team_drill":
      return "From Team";
    case "curated":
      return "Curated";
    default:
      return "Scenario";
  }
}

function difficultyLabel(d: 1 | 2 | 3 | 4 | 5) {
  switch (d) {
    case 1:
      return "Easy";
    case 2:
      return "Normal";
    case 3:
      return "Hard";
    case 4:
      return "Expert";
    case 5:
      return "Boss";
    default:
      return "—";
  }
}