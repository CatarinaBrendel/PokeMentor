import React from "react";
import type {
  PracticeScenarioDetails,
  PracticeActiveMonSummary,
  PracticeAttemptSummary,
} from "../model/practice.types";

type PracticeScenarioDetailsPanelProps = {
  details: PracticeScenarioDetails | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function PracticeScenarioDetailsPanel({
  details,
}: PracticeScenarioDetailsPanelProps) {
  if (!details) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
        <div className="text-sm text-slate-500">
          Select a scenario to start practicing
        </div>
      </div>
    );
  }

  const { title, description, user_side, opponent_side, attempts } = details;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xl font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        ) : null}
      </div>

      {/* Sides */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SideCard title="Your side" side={user_side} />
        <SideCard title="Opponent" side={opponent_side} />
      </div>

      {/* Actions */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Choose your action for this turn.
          </div>

          <div className="flex items-center gap-2">
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
              disabled
              className={cx(
                "rounded-md px-4 py-2 text-sm font-medium",
                "bg-emerald-900 text-white",
                "opacity-50"
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
}: {
  title: string;
  side?: PracticeScenarioDetails["user_side"] | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">{title}</div>

      {!side ? (
        <div className="text-sm text-slate-400">No data</div>
      ) : (
        <>
          <ActiveMon active={side.active} />
          <Bench bench={side.bench ?? []} />
        </>
      )}
    </div>
  );
}

function ActiveMon({ active }: { active?: PracticeActiveMonSummary | null }) {
  if (!active) {
    return <div className="text-sm text-slate-400">No active Pokémon</div>;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold">
            {active.nickname ?? active.species_name}
          </div>
          <div className="text-xs text-slate-500">
            {active.item_name ? `@ ${active.item_name}` : null}
            {active.ability_name ? ` · ${active.ability_name}` : null}
          </div>
        </div>

        {typeof active.hp_percent === "number" ? (
          <div className="text-sm font-medium text-slate-700">
            {active.hp_percent}%
          </div>
        ) : null}
      </div>

      {/* Moves */}
      {active.moves && active.moves.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {active.moves.map((m) => (
            <button
              key={m.move_name}
              type="button"
              disabled={m.disabled}
              className={cx(
                "rounded-md border px-3 py-2 text-left text-sm",
                m.disabled
                  ? "border-slate-200 bg-slate-100 text-slate-400"
                  : "border-slate-300 bg-white hover:bg-slate-50"
              )}
            >
              <div className="font-medium">{m.move_name}</div>
              {m.hint ? (
                <div className="text-xs text-slate-500">{m.hint}</div>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Bench({ bench }: { bench: PracticeScenarioDetails["user_side"]["bench"] }) {
  if (!bench || bench.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-1 text-xs font-medium text-slate-500">Bench</div>
      <div className="flex flex-wrap gap-2">
        {bench.map((m, idx) => (
          <div
            key={idx}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs"
          >
            {m.species_name}
            {typeof m.hp_percent === "number" ? ` · ${m.hp_percent}%` : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function AttemptsCard({ attempts }: { attempts: PracticeAttemptSummary[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-slate-700">
        Past attempts
      </div>

      {attempts.length === 0 ? (
        <div className="text-sm text-slate-400">
          No attempts yet. Try a line to get started.
        </div>
      ) : (
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">
                  {a.summary ?? "Attempt"}
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(a.created_at).toLocaleString()}
                </div>
              </div>

              <OutcomeBadge rating={a.rating} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OutcomeBadge({
  rating,
}: {
  rating: PracticeAttemptSummary["rating"];
}) {
  const map: Record<
    PracticeAttemptSummary["rating"],
    { label: string; cls: string }
  > = {
    better: {
      label: "Better",
      cls: "bg-emerald-100 text-emerald-800",
    },
    neutral: {
      label: "Neutral",
      cls: "bg-slate-100 text-slate-700",
    },
    worse: {
      label: "Worse",
      cls: "bg-rose-100 text-rose-800",
    },
    unknown: {
      label: "Unknown",
      cls: "bg-slate-100 text-slate-500",
    },
  };

  const v = map[rating];

  return (
    <span
      className={cx(
        "rounded-full px-3 py-1 text-xs font-medium",
        v.cls
      )}
    >
      {v.label}
    </span>
  );
}