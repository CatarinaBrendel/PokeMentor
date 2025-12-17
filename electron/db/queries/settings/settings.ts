import type BetterSqlite3 from "better-sqlite3";
import { getDb } from "../../index";
import { UpdateSettingsArgs, SettingsSnapshot } from "./settings.types";

function normalizeShowdownName(name: string): string {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}

export function backfillIsUserForAllBattles(
  db: BetterSqlite3.Database,
  showdownUsername: string | null
) {
  // Always clear first (guarantees 0/1 user side per battle)
  const clearAll = db.prepare(`UPDATE battle_sides SET is_user = 0`);
  const setUserForBattle = db.prepare(`
    UPDATE battle_sides
    SET is_user = 1
    WHERE battle_id = ? AND side = ?
  `);

  // If user cleared the setting, we’re done after clearing.
  if (!showdownUsername) {
    clearAll.run();
    return;
  }

  const target = normalizeShowdownName(showdownUsername);

  // Get all battles that have sides
  const battles = db
    .prepare(`SELECT DISTINCT battle_id FROM battle_sides`)
    .all() as Array<{ battle_id: string }>;

  const getSides = db.prepare(`
    SELECT side, player_name
    FROM battle_sides
    WHERE battle_id = ?
  `);

  const tx = db.transaction(() => {
    clearAll.run();

    for (const b of battles) {
      const sides = getSides.all(b.battle_id) as Array<{
        side: "p1" | "p2";
        player_name: string;
      }>;

      const match = sides.find(
        (s) => normalizeShowdownName(s.player_name) === target
      );

      if (match) {
        setUserForBattle.run(b.battle_id, match.side);
      }
    }
  });

  tx();
}

export function relabelBattleSidesForUser(db: BetterSqlite3.Database, showdownUsernameRaw: string) {
  const showdownNorm = normalizeShowdownName(showdownUsernameRaw);

  const battles = db
    .prepare(
      `SELECT DISTINCT battle_id
       FROM battle_sides`
    )
    .all() as Array<{ battle_id: string }>;

  const getSides = db.prepare(
    `SELECT side, player_name
     FROM battle_sides
     WHERE battle_id = ?`
  );

  const clearFlags = db.prepare(
    `UPDATE battle_sides SET is_user = 0 WHERE battle_id = ?`
  );

  const setUser = db.prepare(
    `UPDATE battle_sides SET is_user = 1
     WHERE battle_id = ? AND side = ?`
  );

  const tx = db.transaction(() => {
    for (const b of battles) {
      const sides = getSides.all(b.battle_id) as Array<{ side: "p1" | "p2"; player_name: string }>;

      const match = sides.find((s) => normalizeShowdownName(s.player_name) === showdownNorm);
      if (!match) continue;

      clearFlags.run(b.battle_id);
      setUser.run(b.battle_id, match.side);
    }
  });

  tx();
}

export function getSettings(): SettingsSnapshot {
  const db = getDb();

  const rows = db
    .prepare(`SELECT key, value FROM app_settings`)
    .all() as Array<{ key: string; value: string }>;

  const map = new Map(rows.map(r => [r.key, r.value]));

  return {
    showdown_username: map.get("showdown_username") ?? null,
  };
}

export function updateSettings(args: UpdateSettingsArgs): SettingsSnapshot {
  const db = getDb();

  const tx = db.transaction(() => {
    if (typeof args.showdown_username === "string") {
      const name = args.showdown_username.trim();
      const normalized = name.length ? name : null;

      if (normalized) {
        db.prepare(`
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('showdown_username', ?, strftime('%s','now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `).run(normalized);
      } else {
        // user cleared the field
        db.prepare(`DELETE FROM app_settings WHERE key = 'showdown_username'`).run();
      }

      // Backfill all existing battles (and reset if cleared)
      backfillIsUserForAllBattles(db, normalized);
    }
  });

  tx();
  return getSettings();
}