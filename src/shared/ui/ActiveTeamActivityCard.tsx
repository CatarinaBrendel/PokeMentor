// src/shared/ui/ActiveTeamActivityCard.tsx
import React from "react";
import type { ActiveTeamActivity } from "../../features/teams/model/teams.types";
import { DASHBOARD_CARD } from "./CardBase";

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleDateString() : "—";
}

type Props = {
  activity: ActiveTeamActivity | null;

  // Step 2 hook (optional): clickable later
  onOpenLastBattle?: () => void;
};

export default function ActiveTeamActivityCard({ activity, onOpenLastBattle }: Props) {
  if (!activity?.activeTeam) return null;

  const { activeTeam, last_import_at, last_battle_at, total_battles } = activity;

  const hasBattles = (total_battles ?? 0) > 0 && !!last_battle_at;

  return (
    <div className={DASHBOARD_CARD}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-dust-900">Recent activity</div>
        <div className="text-xs text-dust-500 truncate">
          for {activeTeam.name ?? "Untitled team"}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="text-[11px] text-dust-500">Last import</div>
          <div className="mt-1 text-sm font-semibold text-dust-900">
            {fmtDate(last_import_at)}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="text-[11px] text-dust-500">Last battle</div>

          {/* Step 2: make clickable later; for now shows date or — */}
          {hasBattles ? (
            <button
              type="button"
              onClick={onOpenLastBattle}
              className="mt-1 inline-flex items-center text-sm font-semibold text-dust-900 hover:underline"
              title="Open last battle (coming soon)"
            >
              {fmtDate(last_battle_at)}
            </button>
          ) : (
            <div className="mt-1 text-sm font-semibold text-dust-900">—</div>
          )}

          {!hasBattles ? (
            <div className="mt-2 text-xs text-dust-500">
              Import your first battle to unlock insights.
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <div className="text-[11px] text-dust-500">Total battles</div>
          <div className="mt-1 text-sm font-semibold text-dust-900">
            {total_battles ?? 0}
          </div>
        </div>
      </div>
    </div>
  );
}