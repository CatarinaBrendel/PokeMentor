// teams/linking/backfillLinksForTeamVersion.ts
import type BetterSqlite3 from "better-sqlite3";
import { tryLinkBattleToTeamVersion } from "../../battles/matchers/tryLinkBattleToTeamVersion";
import type { TeamsRepo } from "../repo/teamsRepo";

type Side = "p1" | "p2";
type BattleIdRow = { id: string };
type UserSideRow = { side: Side } | undefined;
type CountRow = { side: Side; c: number };

function getUserSide(db: BetterSqlite3.Database, battleId: string): Side | null {
  const row = db
    .prepare(
      `SELECT side
       FROM battle_sides
       WHERE battle_id = ? AND is_user = 1
       LIMIT 1`
    )
    .get(battleId) as UserSideRow;

  return row?.side ?? null;
}

export function backfillLinksForTeamVersion(
  db: BetterSqlite3.Database,
  deps: { teamsRepo: TeamsRepo},
  args: { teamVersionId: string; formatKeyHint?: string | null; limit?: number; debug?: boolean }
) {
  const limit = args.limit ?? 500;

  const selectBattleIdsByFormat = db.prepare(`
    SELECT b.id
    FROM battles b
    WHERE COALESCE(b.format_id, b.format_name, '') = ?
      AND NOT EXISTS (
        SELECT 1
        FROM battle_team_links l
        JOIN battle_sides s
          ON s.battle_id = l.battle_id
        AND s.side = l.side
        WHERE l.battle_id = b.id
          AND s.is_user = 1
          AND l.team_version_id IS NOT NULL
      )
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ?
  `);

  const selectBattleIdsAnyFormat = db.prepare(`
    SELECT b.id
    FROM battles b
    WHERE NOT EXISTS (
      SELECT 1
      FROM battle_team_links l
      JOIN battle_sides s
        ON s.battle_id = l.battle_id
      AND s.side = l.side
      WHERE l.battle_id = b.id
        AND s.is_user = 1
        AND l.team_version_id IS NOT NULL
    )
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ?
  `);

  const formatKey = args.formatKeyHint?.trim() || null;

  let battleIds: BattleIdRow[] = [];
  if (formatKey) {
    battleIds = selectBattleIdsByFormat.all(formatKey, limit) as BattleIdRow[];
  }
  if (!battleIds.length) {
    battleIds = selectBattleIdsAnyFormat.all(limit) as BattleIdRow[];
  }

  const previewCountsStmt = db.prepare(
    `SELECT side, COUNT(*) AS c
     FROM battle_preview_pokemon
     WHERE battle_id = ?
     GROUP BY side`
  );

  const revealedCountsStmt = db.prepare(
    `SELECT side, COUNT(*) AS c
     FROM battle_revealed_sets
     WHERE battle_id = ?
     GROUP BY side`
  );

  let linked = 0;
  let scanned = 0;

  for (const b of battleIds) {
    scanned += 1;

    const userSide = getUserSide(db, b.id);
    const previewCounts = previewCountsStmt.all(b.id) as CountRow[];
    const revealedCounts = revealedCountsStmt.all(b.id) as CountRow[];

    const r = tryLinkBattleToTeamVersion(db, deps, {
      battleId: b.id,
      teamVersionId: args.teamVersionId,
    });

    if (args.debug) {
      console.log("[backfill] battle", b.id, {
        userSide,
        previewCounts,
        revealedCounts,
        linked: r.linked,
        confidence: r.confidence,
        method: r.method,
      });
    }

    if (r.linked) linked += 1;
  }

  return { scanned, linked };
}