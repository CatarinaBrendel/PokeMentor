import type { Database as SqliteDatabase } from "better-sqlite3";
import { randomUUID } from "crypto";
import { PracticeDecisionSnapshotService } from "../services/PracticeDecisionSnapshotService.ts";
import { PracticeScenarioStatus, PracticeScenarioSource } from "../practice.types.ts";

export type PracticeScenarioRow = {
  id: string;
  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;
  title: string;
  subtitle: string | null;
  description: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;
  user_side: "p1" | "p2" | null;

  tags_json: string;
  difficulty: number | null;

  attempts_count: number;
  last_practiced_at: number | null;
  best_rating: string | null;

  snapshot_json: string;
  snapshot_hash: string | null;
  snapshot_created_at: number | null;

  created_at: number;
  updated_at: number;
};

// Backend “details” DTO returned to renderer (panel-ready).
export type PracticeScenarioDetailsDto = {
  id: string;
  source: string;
  status: string;

  title: string;
  subtitle: string | null;
  description: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;
  user_side: "p1" | "p2" | null;

  tags_json: string;
  difficulty: number | null;

  attempts_count: number;
  last_practiced_at: number | null;
  best_rating: string | null;

  snapshot: unknown; // JSON parsed snapshot; renderer maps to UI types
};

function isEmptySnapshotJson(s: string | null | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  return t === "" || t === "{}" || t === "null";
}

export function practiceScenariosRepo(db: SqliteDatabase) {
  type Side = "p1" | "p2";

  function inferUserSideFromBattle(battleId: string): Side | null {
    const row = db
      .prepare(
        `
        SELECT side
        FROM battle_sides
        WHERE battle_id = ? AND is_user = 1
        LIMIT 1
        `
      )
      .get(battleId) as { side: Side } | undefined;

    return row?.side ?? null;
  }

  function updateUserSide(args: { id: string; user_side: Side; updated_at: number }) {
    db.prepare(
      `
      UPDATE practice_scenarios
      SET user_side = ?, updated_at = ?
      WHERE id = ?
      `
    ).run(args.user_side, args.updated_at, args.id);
  }
  
  const snapSvc = PracticeDecisionSnapshotService(db);

  function listMyScenarios(): PracticeScenarioRow[] {
    return db
      .prepare(
        `
        SELECT *
        FROM practice_scenarios
        WHERE status <> 'archived'
        ORDER BY
          COALESCE(last_practiced_at, created_at) DESC
        `
      )
      .all() as PracticeScenarioRow[];
  }

  function getScenarioById(id: string): PracticeScenarioRow | null {
    return (db.prepare(`SELECT * FROM practice_scenarios WHERE id = ?`).get(id) ??
      null) as PracticeScenarioRow | null;
  }

  function updateSnapshot(args: {
    id: string;
    snapshot_json: string;
    snapshot_hash: string;
    snapshot_created_at: number;
    updated_at: number;
  }) {
    db.prepare(
      `
      UPDATE practice_scenarios
      SET
        snapshot_json = ?,
        snapshot_hash = ?,
        snapshot_created_at = ?,
        updated_at = ?
      WHERE id = ?
      `
    ).run(
      args.snapshot_json,
      args.snapshot_hash,
      args.snapshot_created_at,
      args.updated_at,
      args.id
    );
  }

  function computeSnapshotHash(s: PracticeScenarioRow): string | null {
    if (!s.battle_id || !s.turn_number || !s.user_side) return null;
    // v1: stable and sufficient for now; later include replay_id/raw_log hash for invalidation.
    return `battle:${s.battle_id}::turn:${s.turn_number}::side:${s.user_side}::v1`;
  }

  function ensureDecisionSnapshot(s: PracticeScenarioRow): { snapshot_json: string; snapshot_hash: string } | null {
    const hash = computeSnapshotHash(s);
    console.log("[ensureDecisionSnapshot]", {
      id: s.id,
      battle_id: s.battle_id,
      turn_number: s.turn_number,
      user_side: s.user_side,
      hash,
      snap_len: s.snapshot_json?.length ?? null,
      snapshot_hash: s.snapshot_hash,
      snapshot_created_at: s.snapshot_created_at,
    });
    if (!hash) return null;

    const cachedOk =
      s.snapshot_hash === hash && !isEmptySnapshotJson(s.snapshot_json) && s.snapshot_created_at != null;

    if (cachedOk) {
      return { snapshot_json: s.snapshot_json, snapshot_hash: hash };
    }

    // Build from DB at the start of decision turn
    const snapshot = snapSvc.buildDecisionSnapshot({
      battleId: s.battle_id!,
      turnNumber: s.turn_number!,
      userSide: s.user_side!,
    });

    console.log("[buildDecisionSnapshot result keys]", Object.keys(snapshot ?? {}));

    const now = Math.floor(Date.now() / 1000);
    const snapshot_json = JSON.stringify(snapshot);

    updateSnapshot({
      id: s.id,
      snapshot_json,
      snapshot_hash: hash,
      snapshot_created_at: now,
      updated_at: now,
    });

    return { snapshot_json, snapshot_hash: hash };
  }

  /**
   * Create (or return existing) scenario from a battle turn.
   * Idempotent due to UNIQUE index.
   */
  function insertFromBattleTurn(args: {
    battle_id: string;
    turn_number: number;
    title?: string;
  }): PracticeScenarioRow {
    const now = Math.floor(Date.now() / 1000);
    const id = randomUUID();
    const title = args.title ?? `Battle ${args.battle_id} · Turn ${args.turn_number}`;

    const user_side = inferUserSideFromBattle(args.battle_id);
    if (!user_side) {
      throw new Error(
        `Cannot infer user_side for battle ${args.battle_id}. ` +
        `Expected battle_sides row with is_user = 1.`
      );
    }

    db.prepare(
      `
      INSERT OR IGNORE INTO practice_scenarios (
        id,
        source,
        status,
        title,
        subtitle,
        battle_id,
        turn_number,
        user_side,
        tags_json,
        attempts_count,
        created_at,
        updated_at
      ) VALUES (
        ?, 'battle_review', 'active', ?, 'Created from Battle Review',
        ?, ?, ?,
        '[]', 0, ?, ?
      )
      `
    ).run(id, title, args.battle_id, args.turn_number, user_side, now, now);

    const row = db
      .prepare(
        `
        SELECT *
        FROM practice_scenarios
        WHERE source = 'battle_review'
          AND battle_id = ?
          AND turn_number = ?
        `
      )
      .get(args.battle_id, args.turn_number) as PracticeScenarioRow;

    if (row.battle_id && row.turn_number && row.user_side) {
      ensureDecisionSnapshot(row);
    }

    // refetch so caller gets updated snapshot fields if you ever return them
    const fresh = getScenarioById(row.id);
    return fresh ?? row;
  }

  /**
   * Panel-ready details:
   * - ensures snapshot_json exists for battle-derived scenarios
   * - returns parsed snapshot under `snapshot`
   */
  function getDetails(id: string): PracticeScenarioDetailsDto | null {
    // Backfill user_side for battle-derived scenarios that were created before we stored it
    let s = getScenarioById(id);
    if (!s) return null;

    if (s.battle_id && s.turn_number && !s.user_side) {
      const inferred = inferUserSideFromBattle(s.battle_id);
      if (inferred) {
        const now = Math.floor(Date.now() / 1000);
        updateUserSide({ id: s.id, user_side: inferred, updated_at: now });
        s = getScenarioById(id) ?? s;
      }
    }
    
    const ensured = ensureDecisionSnapshot(s);
    const snapJson = ensured?.snapshot_json ?? s.snapshot_json;

    let snapshot: unknown = {};
    try {
      snapshot = snapJson ? JSON.parse(snapJson) : {};
    } catch {
      snapshot = {};
    }

    return {
      id: s.id,
      source: s.source,
      status: s.status,
      title: s.title,
      subtitle: s.subtitle,
      description: s.description,
      format_id: s.format_id,
      team_id: s.team_id,
      team_version_id: s.team_version_id,
      battle_id: s.battle_id,
      turn_number: s.turn_number,
      user_side: s.user_side,
      tags_json: s.tags_json,
      difficulty: s.difficulty,
      attempts_count: s.attempts_count,
      last_practiced_at: s.last_practiced_at,
      best_rating: s.best_rating,
      snapshot,
    };
  }

  return {
    listMyScenarios,
    getScenarioById,
    insertFromBattleTurn,
    getDetails,
  };
}