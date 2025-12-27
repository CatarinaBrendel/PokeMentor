// teams/services/TeamActiveService.ts
//
// Small orchestration layer for "active team" behaviors.
// - Keeps DB code in teamsRepo
// - Keeps any post-commit side effects (e.g., linking) optional and explicit

import type { ActiveTeamActivity, TeamListRow } from "../teams.types";
import type { TeamsRepo } from "../repo/teamsRepo";

export class TeamActiveService {
  constructor(
    private readonly repo: TeamsRepo
  ) {}

  /**
   * Marks the given team as active (and clears any previous active team).
   * Returns { ok: true } for API convenience.
   */
  setActiveTeam(teamId: string): { ok: true } {
    // Your repo should already wrap this in a transaction if needed.
    this.repo.setActiveTeam(teamId);
    return { ok: true };
  }

  /**
   * Returns a lightweight summary row for the active team, or null if none.
   */
  getActiveTeamSummary(): TeamListRow | null {
    return this.repo.getActiveTeamSummary();
  }

  /**
   * Returns the active team plus high-level activity counters:
   * - last import time
   * - last linked battle time
   * - total linked battles
   */
  getActiveTeamActivity(): ActiveTeamActivity {
    return this.repo.getActiveTeamActivity();
  }

  /**
   * Convenience helper if you prefer a single endpoint that both sets
   * the active team and returns the activity payload for immediate UI refresh.
   */
  setActiveTeamAndGetActivity(teamId: string): ActiveTeamActivity {
    this.setActiveTeam(teamId);
    return this.getActiveTeamActivity();
  }
}