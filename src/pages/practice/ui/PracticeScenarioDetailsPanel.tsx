import React from "react";
import type {
  PracticeScenarioDetails,
  PracticeActiveMonSummary,
  PracticeAttemptSummary,
} from "../model/practice.types";

type SelectedAction =
  | { kind: "move"; moveName: string }
  | { kind: "switch"; speciesName: string };

type PracticeScenarioDetailsPanelProps = {
  details: PracticeScenarioDetails | null;

  selectedAction: SelectedAction | null;
  onSelectMove: (moveName: string) => void;
  onSelectSwitch: (speciesName: string) => void;
  onRunOutcome: () => void;

  onClearSelection?: () => void;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeScenarioDetailsPanel({
  details,
  selectedAction,
  onSelectMove,
  onRunOutcome,
  onClearSelection,
  onSelectSwitch
}: PracticeScenarioDetailsPanelProps) {
  if (!details) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
        <div className="text-sm text-slate-500">Select a scenario to start practicing</div>
      </div>
    );
  }

  const { title, description, user_side, opponent_side, attempts } = details;

  const canRun = Boolean(selectedAction);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto pr-1">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>

      {/* Sides */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SideCard
          title="Your side"
          side={user_side}
          selectedAction={selectedAction}
          onSelectMove={onSelectMove}
          onSelectSwitch={onSelectSwitch}
          onClearSelection={onClearSelection}
        />
        <SideCard title="Opponent" side={opponent_side} />
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-slate-600">
            Choose your action for this turn.
            {selectedAction ? (
              <span className="ml-2 font-medium text-slate-800">
                Selected:{" "}
                {selectedAction.kind === "move"
                  ? selectedAction.moveName
                  : `Switch to ${selectedAction.speciesName}`}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onClearSelection ? (
              <button
                type="button"
                onClick={onClearSelection}
                disabled={!selectedAction}
                className={cx(
                  "rounded-md px-4 py-2 text-sm font-medium",
                  selectedAction
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-slate-100 text-slate-400"
                )}
              >
                Clear
              </button>
            ) : null}

            <button
              type="button"
              disabled
              className={cx(
                "rounded-md px-4 py-2 text-sm font-medium",
                "bg-slate-100 text-slate-400"
              )}
            >
              Compare attempts
            </button>

            <button
              type="button"
              onClick={onRunOutcome}
              disabled={!canRun}
              className={cx(
                "rounded-md px-4 py-2 text-sm font-medium",
                canRun
                  ? "bg-emerald-900 text-white hover:bg-emerald-800 active:bg-emerald-950"
                  : "bg-emerald-900 text-white opacity-50"
              )}
            >
              Run outcome
            </button>
          </div>
        </div>
      </div>

      {/* Attempts */}
      <AttemptsCard attempts={attempts ?? []} />
    </div>
  );
}

function SideCard({
  title,
  side,
  selectedAction,
  onSelectMove,
  onSelectSwitch,
  onClearSelection,
}: {
  title: string;
  side?: PracticeScenarioDetails["user_side"] | null;
  selectedAction?: SelectedAction | null;
  onSelectMove?: (moveName: string) => void;
  onSelectSwitch?: (speciesName: string) => void;
  onClearSelection?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>

      {!side ? (
        <div className="text-sm text-slate-400">No data</div>
      ) : (
        <>
          <ActiveMon 
            active={side.active} 
            selectedAction={selectedAction} 
            onSelectMove={onSelectMove} 
            onClearSelection={onClearSelection}
          />
          <Bench
            bench={side.bench ?? []}
            selectedAction={selectedAction}
            onSelectSwitch={onSelectSwitch}
            onClearSelection={onClearSelection}
          />
        </>
      )}
    </div>
  );
}

function ActiveMon({
  active,
  selectedAction,
  onSelectMove,
  onClearSelection,
}: {
  active?: PracticeActiveMonSummary | null;
  selectedAction?: SelectedAction | null;
  onSelectMove?: (moveName: string) => void;
  onClearSelection?: () => void;
}) {
  if (!active) {
    return <div className="text-sm text-slate-400">No active Pokémon</div>;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">{active.nickname ?? active.species_name}</div>
          <div className="text-xs text-slate-500">
            {active.item_name ? `@ ${active.item_name}` : null}
            {active.ability_name ? ` · ${active.ability_name}` : null}
          </div>
        </div>

        {typeof active.hp_percent === "number" ? (
          <div className="text-sm font-medium text-slate-700">{active.hp_percent}%</div>
        ) : null}
      </div>

      {/* Moves */}
      {active.moves && active.moves.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {active.moves.map((m) => {
            const isSelected =
              selectedAction?.kind === "move" && selectedAction.moveName === m.move_name;

            const disabled = Boolean(m.disabled) || !onSelectMove;

            return (
              <button
                key={m.move_name}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (
                    selectedAction?.kind === "move" &&
                    selectedAction.moveName === m.move_name
                  ) {
                    onClearSelection?.();
                  } else {
                    onSelectMove?.(m.move_name);
                  }
                }}
                className={cx(
                  "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  disabled
                    ? "border-slate-200 bg-slate-100 text-slate-400"
                    : isSelected
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-slate-300 bg-white hover:bg-slate-50"
                )}
              >
                <div className={cx("font-medium", isSelected && "text-emerald-900")}>
                  {m.move_name}
                </div>
                {m.hint ? <div className="text-xs text-slate-500">{m.hint}</div> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Bench({
  bench,
  selectedAction,
  onSelectSwitch,
  onClearSelection,
}: {
  bench: PracticeScenarioDetails["user_side"]["bench"];
  selectedAction?: SelectedAction | null;
  onSelectSwitch?: (speciesName: string) => void;
  onClearSelection?: () => void;
}) {
  if (!bench || bench.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-1 text-xs font-medium text-slate-500">Bench</div>
      <div className="flex flex-wrap gap-2">
        {bench.map((m, idx) => {
          const isSelected =
            selectedAction?.kind === "switch" &&
            selectedAction.speciesName === m.species_name;

          const clickable = Boolean(onSelectSwitch);

          return (
            <button
              key={`${m.species_name}-${idx}`}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (
                  selectedAction?.kind === "switch" &&
                  selectedAction.speciesName === m.species_name
                ) {
                  onClearSelection?.();
                } else {
                  onSelectSwitch?.(m.species_name);
                }
              }}
              className={cx(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                !clickable
                  ? "border-slate-200 bg-slate-50 text-slate-400"
                  : isSelected
                  ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
              )}
            >
              {m.species_name}
              {typeof m.hp_percent === "number" ? ` · ${m.hp_percent}%` : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AttemptsCard({ attempts }: { attempts: PracticeAttemptSummary[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">Past attempts</div>

      {attempts.length === 0 ? (
        <div className="text-sm text-slate-400">No attempts yet. Try a line to get started.</div>
      ) : (
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">{a.summary ?? "Attempt"}</div>
                <div className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</div>
              </div>

              <OutcomeBadge rating={a.rating} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutcomeBadge({ rating }: { rating: PracticeAttemptSummary["rating"] }) {
  const map: Record<PracticeAttemptSummary["rating"], { label: string; cls: string }> = {
    better: { label: "Better", cls: "bg-emerald-100 text-emerald-800" },
    neutral: { label: "Neutral", cls: "bg-slate-100 text-slate-700" },
    worse: { label: "Worse", cls: "bg-rose-100 text-rose-800" },
    unknown: { label: "Unknown", cls: "bg-slate-100 text-slate-500" },
  };

  const v = map[rating];

  return <span className={cx("rounded-full px-3 py-1 text-xs font-medium", v.cls)}>{v.label}</span>;
}