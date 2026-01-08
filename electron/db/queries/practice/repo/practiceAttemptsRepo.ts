import type { Database as SqliteDatabase } from "better-sqlite3";
import { randomUUID } from "crypto";

export type PracticeOutcomeRating = "worse" | "neutral" | "better";
export type SelectedAction =
  | { kind: "move"; moveName: string }
  | { kind: "switch"; speciesName: string };

export type PracticeAttemptRow = {
  id: string;
  scenario_id: string;
  created_at: number;
  selected_action_json: string;
  result_json: string;
  rating: PracticeOutcomeRating | null;
  summary: string | null;
  duration_ms: number | null;
  sim_engine: string | null;
  sim_version: string | null;
  notes: string | null;
};

export function practiceAttemptsRepo(db: SqliteDatabase) {
  function listByScenarioId(scenarioId: string, limit = 50): PracticeAttemptRow[] {
    return db
      .prepare(
        `
        SELECT
          id,
          scenario_id,
          created_at,
          selected_action_json,
          result_json,
          rating,
          summary,
          duration_ms,
          sim_engine,
          sim_version,
          notes
        FROM practice_attempts
        WHERE scenario_id = ?
        ORDER BY created_at DESC
        LIMIT ?
        `
      )
      .all(scenarioId, limit) as PracticeAttemptRow[];
  }

  function insertAttempt(args: {
    scenario_id: string;
    selected_action: SelectedAction;
    // Optional placeholder fields; you can expand later when sim exists
    rating?: PracticeOutcomeRating | null;
    summary?: string | null;
    result?: unknown;
    duration_ms?: number | null;
    sim_engine?: string | null;
    sim_version?: string | null;
    notes?: string | null;
  }): PracticeAttemptRow {
    const now = Math.floor(Date.now() / 1000);
    const id = randomUUID();

    const selected_action_json = JSON.stringify(args.selected_action ?? {});
    const result_json = JSON.stringify(args.result ?? {});

    db.prepare(
      `
      INSERT INTO practice_attempts (
        id,
        scenario_id,
        created_at,
        selected_action_json,
        result_json,
        rating,
        summary,
        duration_ms,
        sim_engine,
        sim_version,
        notes
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
      `
    ).run(
      id,
      args.scenario_id,
      now,
      selected_action_json,
      result_json,
      args.rating ?? null,
      args.summary ?? null,
      args.duration_ms ?? null,
      args.sim_engine ?? null,
      args.sim_version ?? null,
      args.notes ?? null
    );

    const row = db
      .prepare(
        `
        SELECT
          id,
          scenario_id,
          created_at,
          selected_action_json,
          result_json,
          rating,
          summary,
          duration_ms,
          sim_engine,
          sim_version,
          notes
        FROM practice_attempts
        WHERE id = ?
        `
      )
      .get(id) as PracticeAttemptRow;

    return row;
  }

  return {
    listByScenarioId,
    insertAttempt,
  };
}