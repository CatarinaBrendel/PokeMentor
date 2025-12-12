import { getDb } from "./db";

export type BattleRow = {
  id: string;
  played_at: string;
  format: string | null;
  result: string | null;
};

export function insertBattle(args: {
  id: string;
  played_at: string; // ISO string
  format?: string;
  result?: string;
  raw_log?: string;
}) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO battles (id, played_at, format, result, raw_log)
    VALUES (@id, @played_at, @format, @result, @raw_log)
    ON CONFLICT(id) DO UPDATE SET
      played_at=excluded.played_at,
      format=excluded.format,
      result=excluded.result,
      raw_log=excluded.raw_log
  `);
  stmt.run({
    id: args.id,
    played_at: args.played_at,
    format: args.format ?? null,
    result: args.result ?? null,
    raw_log: args.raw_log ?? null,
  });
}

export function listRecentBattles(limit = 20): BattleRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, played_at, format, result
    FROM battles
    ORDER BY played_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as BattleRow[];
}