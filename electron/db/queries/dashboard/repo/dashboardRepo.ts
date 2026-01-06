// electron/db/queries/dashboard/repo/dashboardRepo.ts
import type { Database as SqliteDatabase } from "better-sqlite3";

export type DashboardKpis = {
  battles_total: number;
  wins: number;
  losses: number;
  winrate_percent: number;
  teams_total: number;
  team_versions_total: number;
  linked_battles_total: number;
};

export function dashboardRepo(db: SqliteDatabase) {
  function getKpis(): DashboardKpis {
    // A battle has a "user side" if:
    // - battle_sides.is_user=1 (requires showdown_username), OR
    // - there is a battle_team_links row with a non-null team_version_id
    const wlRow = db
      .prepare(
        `
        WITH inferred_user_side AS (
          SELECT
            b.id AS battle_id,
            COALESCE(
              (SELECT s.side
                 FROM battle_sides s
                WHERE s.battle_id = b.id AND s.is_user = 1
                LIMIT 1),
              (SELECT l.side
                 FROM battle_team_links l
                WHERE l.battle_id = b.id AND l.team_version_id IS NOT NULL
                LIMIT 1)
            ) AS user_side
          FROM battles b
        )
        SELECT
          -- battles where we can infer a user side
          SUM(CASE WHEN i.user_side IS NOT NULL THEN 1 ELSE 0 END) AS battles_total,

          -- wins/losses for battles with an inferred user side and a decided winner
          SUM(CASE WHEN i.user_side IS NOT NULL AND b.winner_side = i.user_side THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN i.user_side IS NOT NULL AND b.winner_side IS NOT NULL AND b.winner_side <> i.user_side THEN 1 ELSE 0 END) AS losses
        FROM inferred_user_side i
        JOIN battles b ON b.id = i.battle_id
      `
      )
      .get() as { battles_total: number | null; wins: number | null; losses: number | null };

    const battles_total = wlRow.battles_total ?? 0;
    const wins = wlRow.wins ?? 0;
    const losses = wlRow.losses ?? 0;

    const decided = wins + losses;
    const winrate_percent = decided > 0 ? Math.round((wins / decided) * 100) : 0;

    const teamsRow = db.prepare(`SELECT COUNT(*) AS n FROM teams`).get() as { n: number };
    const teamVersionsRow = db.prepare(`SELECT COUNT(*) AS n FROM team_versions`).get() as { n: number };

    const linkedBattlesRow = db
      .prepare(
        `
        SELECT COUNT(DISTINCT battle_id) AS n
        FROM battle_team_links
        WHERE team_version_id IS NOT NULL
      `
      )
      .get() as { n: number };

    return {
      battles_total,
      wins,
      losses,
      winrate_percent,
      teams_total: teamsRow.n ?? 0,
      team_versions_total: teamVersionsRow.n ?? 0,
      linked_battles_total: linkedBattlesRow.n ?? 0,
    };
  }

  return { getKpis };
}