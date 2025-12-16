import * as React from "react";
import type { TeamListRow } from "../../features/teams/model/teams.types";
import {DASHBOARD_CARD} from "./CardBase"

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function ActiveTeamCard({
  team,
  loading,
  error,
  onOpenTeams,
  onOpenTeam,
}: {
  team: TeamListRow | null;
  loading?: boolean;
  error?: string | null;
  onOpenTeams: () => void;
  onOpenTeam: (teamId: string) => void;
}) {
  return (
    <div className={DASHBOARD_CARD}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-dust-900">Active Team
            <span className="mx-2 text-xs text-dust-600">
              Your current focus team for coaching and metrics.
            </span>
          </div>
        </div>

        <button
          type="button"
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-dust-800 ring-1 ring-black/10 hover:bg-dust-50"
          onClick={onOpenTeams}
        >
          Teams
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-dust-600">Loading…</div>
        ) : error ? (
          <div className="text-sm text-dust-600">
            Couldn’t load active team.
          </div>
        ) : !team ? (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-sm font-semibold text-dust-900">
              No active team set
            </div>
            <div className="mt-1 text-sm text-dust-600">
              Set one from Team Details to personalize your dashboard.
            </div>
            <button
              type="button"
              className="mt-3 rounded-xl bg-fern-500/15 px-3 py-2 text-xs font-semibold text-fern-800 ring-1 ring-black/10 hover:bg-fern-500/20"
              onClick={onOpenTeams}
            >
              Choose active team
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-fern-100 px-2 py-0.5 text-xs font-semibold text-fern-700">
                    Active
                  </span>
                  <div className="truncate text-sm font-semibold text-dust-900">
                    {team.name ?? "Untitled team"}
                  </div>
                </div>

                <div className="mt-1 text-xs text-dust-600 space-x-2">
                  <span>
                    <span className="text-dust-500">Format:</span>{" "}
                    {team.format_ps ?? "—"}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="text-dust-500">Version:</span>{" "}
                    {team.latest_version_num ?? "—"}
                  </span>
                  <span>·</span>
                  <span>
                    <span className="text-dust-500">Updated:</span>{" "}
                    {new Date(team.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={cx(
                  "shrink-0 rounded-xl px-3 py-2 text-xs font-semibold",
                  "bg-white text-dust-800 ring-1 ring-black/10 hover:bg-dust-50"
                )}
                onClick={() => onOpenTeam(team.id)}
              >
                Open
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}