// electron/db/queries/practice/services/PracticeDecisionSnapshotService.ts
import { Database } from "better-sqlite3";
import type { PracticePosition } from "../db/queries/practice/services/PracticeDecisionSnapshotService";

export function PracticeDecisionSnapshotService(db: Database) {
  function getLatestSwitchFromBattleSwitches(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
    const row = db
      .prepare(
        `
        SELECT
          s.position,
          i.species_name,
          s.hp_text
        FROM battle_switches s
        JOIN battle_pokemon_instances i
          ON i.id = s.pokemon_instance_id
        WHERE s.battle_id = ?
          AND s.position = ?
          AND s.event_index <= ?
        ORDER BY s.event_index DESC
        LIMIT 1
        `
      )
      .get(battleId, pos, eventIndex) as
      | { position: PracticePosition; species_name: string; hp_text: string | null }
      | undefined;

    return row ?? null;
  }

  function parseSwitchRawLine(raw: string): { species_name: string; hp_text: string | null } | null {
    // Typical stored raw_line: "|switch|p1a: Garchomp|Garchomp, L50, M|100/100"
    // Some rows may have leading junk; normalize from first '|'
    const i = raw.indexOf("|");
    const norm = i >= 0 ? raw.slice(i) : raw;

    const parts = norm.split("|");
    // parts: ["", "switch", "p1a: X", "Species, L50...", "100/100"]
    if (parts.length < 4) return null;
    if (parts[1] !== "switch") return null;

    const details = parts[3] ?? "";
    const species_name = details.split(",")[0]?.trim();
    if (!species_name) return null;

    const hp_text = (parts[4] ?? "").trim() || null;
    return { species_name, hp_text };
  }

  function getLatestSwitchFromBattleEvents(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
    const row = db
      .prepare(
        `
        SELECT event_index, raw_line
        FROM battle_events
        WHERE battle_id = ?
          AND event_index <= ?
          AND raw_line LIKE '%|switch|'
          AND raw_line LIKE '%' || ? || '%'
        ORDER BY event_index DESC
        LIMIT 1
        `
      )
      .get(battleId, eventIndex, `${pos}: %`) as
      | { event_index: number; raw_line: string }
      | undefined;

    if (!row?.raw_line) return null;
    const parsed = parseSwitchRawLine(row.raw_line);
    if (!parsed) return null;

    return { position: pos, species_name: parsed.species_name, hp_text: parsed.hp_text } as {
      position: PracticePosition;
      species_name: string;
      hp_text: string | null;
    };
  }

  function getLatestSwitchAtOrBefore(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
    // Preferred: structured ingest tables (battle_switches)
    const fromStructured = getLatestSwitchFromBattleSwitches(battleId, pos, eventIndex);
    if (fromStructured) return fromStructured;

    // Fallback: parse the raw battle_events log
    const fromEvents = getLatestSwitchFromBattleEvents(battleId, pos, eventIndex);
    return fromEvents;
  }

  function buildDecisionSnapshot(_args: {
    battleId: string;
    turnNumber: number;
  }) {
    // ... other logic ...

    // Mark `_args` as intentionally unused to satisfy linters
    void _args;

    const turnStartIdx = null; // placeholder for actual computation
    // placeholder index; not used in this stub implementation
    void turnStartIdx;

    // Debug: confirm we can see initial switch lines through the fallback query
    // (Remove later once stable)
    // eslint-disable-next-line no-console
    // console.log("[snapshot debug idx]", { battleId: args.battleId, turn: args.turnNumber, idx });

    // ... rest of buildDecisionSnapshot implementation ...

    return {
      user_active: [],
      opp_active: [],
      legal_moves: [],
      legal_switches: [],
    };
  }

  return {
    getLatestSwitchAtOrBefore,
    buildDecisionSnapshot,
  };
}

import { ipcMain } from "electron";
import { getDb } from "../db/index";
import { dashboardRepo } from "../db/queries/dashboard/repo/dashboardRepo";
import { teamsRepo } from "../db/queries/teams/repo/teamsRepo";
import { battleRepo } from "../db/queries/battles/repo/battleRepo";
import type { BattleListRow } from "../db/queries/battles/repo/battleRepo";
import { normalizeShowdownName } from "../db/queries/battles/utils/normalizeShowdownName";
import { battleIngestService } from "../db/queries/battles/services/BattleIngestService";
import { BattleLinkService } from "../db/queries/battles/services/BattleLinkService";
import { getSettings, updateSettings } from "../db/queries/settings/settings";
import { getEvTrainingRecipe } from "../ai/openrouter";
import { practiceDetailsService } from "../db/queries/practice/services/PracticeDetailsService";
import { practiceAttemptsRepo } from "../db/queries/practice/repo/practiceAttemptsRepo";
import type { PracticeAttemptRow as PracticeAttemptRowLocal, SelectedAction as SelectedActionLocal, PracticeOutcomeRating as PracticeOutcomeRatingLocal } from "../db/queries/practice/repo/practiceAttemptsRepo";

// Local type for practice scenario rows returned by the DB. Keep this local to avoid
// depending on renderer ambient/global types from `src/`.
type LocalPracticeScenarioRow = {
  id: string;
  source: string;
  status: string;
  title: string;
  subtitle: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;

  tags_json: string;
  difficulty: number | null;

  attempts_count: number;
  last_practiced_at: number | null;
  best_rating: string | null;

  snapshot_json?: string;
  snapshot_hash?: string | null;
  snapshot_created_at?: number | null;

  created_at?: number;
  updated_at?: number;
};
import { randomUUID } from "crypto";

// Expose a register function expected by `electron/main.ts`.
export function registerDbHandlers() {
  try {
    // Dashboard KPIs
    try { ipcMain.removeHandler("db:dashboard:getKpis"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:dashboard:getKpis", () => {
      const db = getDb();
      return dashboardRepo(db).getKpis();
    });

    // Teams handlers (minimal subset used by the renderer)
    try { ipcMain.removeHandler("db:teams:list"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:list", () => {
      const db = getDb();
      return teamsRepo(db).listTeams();
    });

    try { ipcMain.removeHandler("db:teams:getActiveActivity"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:getActiveActivity", () => {
      const db = getDb();
      return teamsRepo(db).getActiveTeamActivity();
    });

    try { ipcMain.removeHandler("db:teams:getActiveSummary"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:getActiveSummary", () => {
      const db = getDb();
      return teamsRepo(db).getActiveTeamSummary();
    });

    try { ipcMain.removeHandler("db:teams:getDetails"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:getDetails", (_e, teamId: string) => {
      const db = getDb();
      return teamsRepo(db).getTeamDetails(teamId);
    });

    try { ipcMain.removeHandler("db:teams:getEvRecipes"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:getEvRecipes", (_e, teamVersionId: string) => {
      const db = getDb();
      return teamsRepo(db).listTeamEvRecipes(teamVersionId);
    });

    try { ipcMain.removeHandler("db:teams:saveEvRecipe"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:saveEvRecipe", (_e, args: { team_version_id: string; pokemon_set_id: string; source: "local" | "ai"; recipe_json: string }) => {
      const db = getDb();
      // upsertTeamEvRecipe expects now; provide ISO timestamp
      teamsRepo(db).upsertTeamEvRecipe({ ...args, now: new Date().toISOString() });
      return { ok: true };
    });

    try { ipcMain.removeHandler("db:teams:setTeamActive"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:setTeamActive", (_e, teamId: string) => {
      const db = getDb();
      teamsRepo(db).setActiveTeam(teamId);
      return { ok: true };
    });

    try { ipcMain.removeHandler("db:teams:delete"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:teams:delete", (_e, teamId: string) => {
      const db = getDb();
      teamsRepo(db).deleteTeam(teamId);
      return { ok: true };
    });

    // Settings handlers
    try { ipcMain.removeHandler("db:settings:get"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:settings:get", () => getSettings());

    try { ipcMain.removeHandler("db:settings:update"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle(
      "db:settings:update",
      (_e, args: { showdown_username?: string | null; openrouter_api_key?: string | null; openrouter_model?: string | null; ai_enabled?: boolean | null }) =>
        updateSettings(args)
    );

    // Battles handlers
    try { ipcMain.removeHandler("db:battles:list"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:battles:list", (_e, args?: { limit?: number; offset?: number }) => {
      const db = getDb();
      const rows = battleRepo(db).listBattles(args) as BattleListRow[];

      // Map DB rows to UI-friendly BattleListItem shape expected by renderer
      return rows.map((r) => {
        const playedAtUnix = r.played_at ?? null;
        const playedAt = playedAtUnix ? new Date(playedAtUnix * 1000).toLocaleDateString() : "—";

        let userBrought: Array<{ species_name: string; is_lead: number }> = [];
        try {
          userBrought = JSON.parse(r.user_brought_json ?? "[]");
        } catch (_err) {
          userBrought = [];
        }

        const inferredResult = (() => {
          if (r.result !== null && r.result !== undefined) return r.result as "win" | "loss";
          // Prefer comparing sides if available
          if (r.winner_side && r.user_side) return r.winner_side === r.user_side ? "win" : "loss";
          // Fallback: compare normalized player names
          if (r.winner_name && r.user_player_name) {
            const w = normalizeShowdownName(r.winner_name);
            const u = normalizeShowdownName(r.user_player_name);
            if (w && u) return w === u ? "win" : "loss";
          }
          return "unknown";
        })();

        return {
          id: r.id,
          playedAtUnix,
          playedAt,
          team_id: r.team_id ?? null,

          result: inferredResult,
          opponentName: (r.opponent_name ?? "") as string,
          format_ps: r.format_name ?? r.format_id ?? null,
          rated: !!r.is_rated,

          userSide: r.user_side ?? null,

          brought: (userBrought || []).map((x) => ({ species_name: x.species_name ?? "", is_lead: !!x.is_lead })),

          broughtUserSeen: null,
          broughtUserExpected: null,
          broughtOpponentSeen: null,
          broughtOpponentExpected: null,
        };
      });
    });

    try { ipcMain.removeHandler("db:battles:getDetails"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:battles:getDetails", (_e, battleId: string) => {
      const db = getDb();
      return battleRepo(db).getBattleDetails(battleId);
    });

    try { ipcMain.removeHandler("db:battles:importReplays"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:battles:importReplays", async (_e, args: { text: string }) => {
      const db = getDb();
      const brepo = battleRepo(db);
      const linkService = BattleLinkService(db, { battleRepo: brepo, teamsRepo: teamsRepo(db) });
      const ingest = battleIngestService(db, { battleRepo: brepo, battleLinkService: linkService });
      return ingest.importFromReplaysText(args.text);
    });

    // Other handlers are provided in the packaged build. Add more here as needed.
    // Practice handlers
    try { ipcMain.removeHandler("db:practice:listMyScenarios"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:practice:listMyScenarios", () => {
      const db = getDb();
      const rows = db.prepare(
        `
        SELECT id, source, status, title, subtitle, format_id, team_id, team_version_id,
               battle_id, turn_number, tags_json, difficulty, attempts_count, last_practiced_at, best_rating
        FROM practice_scenarios
        ORDER BY updated_at DESC
      `
      ).all() as LocalPracticeScenarioRow[];

      return rows.map((r) => ({
        id: r.id,
        source: r.source,
        status: r.status,
        title: r.title,
        subtitle: r.subtitle ?? null,
        format_id: r.format_id ?? null,
        team_id: r.team_id ?? null,
        team_version_id: r.team_version_id ?? null,
        battle_id: r.battle_id ?? null,
        turn_number: r.turn_number ?? null,
        tags_json: r.tags_json ?? "[]",
        difficulty: r.difficulty ?? null,
        attempts_count: r.attempts_count ?? 0,
        last_practiced_at: r.last_practiced_at ?? null,
        best_rating: r.best_rating ?? null,
      }));
    });

    try { ipcMain.removeHandler("db:practice:getScenario"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:practice:getScenario", (_e, id: string) => {
      const db = getDb();
      const r = db.prepare(`SELECT * FROM practice_scenarios WHERE id = ?`).get(id) as LocalPracticeScenarioRow | undefined;
      if (!r) return null;
      return {
        id: r.id,
        source: r.source,
        status: r.status,
        title: r.title,
        subtitle: r.subtitle ?? null,
        format_id: r.format_id ?? null,
        team_id: r.team_id ?? null,
        team_version_id: r.team_version_id ?? null,
        battle_id: r.battle_id ?? null,
        turn_number: r.turn_number ?? null,
        tags_json: r.tags_json ?? "[]",
        difficulty: r.difficulty ?? null,
        attempts_count: r.attempts_count ?? 0,
        last_practiced_at: r.last_practiced_at ?? null,
        best_rating: r.best_rating ?? null,
      };
    });

    try { ipcMain.removeHandler("db:practice:getDetails"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:practice:getDetails", (_e, id: string) => {
      const db = getDb();
      return practiceDetailsService(db).getDetails(id);
    });

    try { ipcMain.removeHandler("db:practice:createFromBattleTurn"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:practice:createFromBattleTurn", (_e, args: { battle_id: string; turn_number: number }) => {
      const db = getDb();
      // Check existing
      const existing = db.prepare(`SELECT * FROM practice_scenarios WHERE source = 'battle_review' AND battle_id = ? AND turn_number = ?`).get(args.battle_id, args.turn_number) as LocalPracticeScenarioRow | undefined;
      if (existing) {
        return {
          id: existing.id,
          title: existing.title,
          subtitle: existing.subtitle ?? null,
          source: existing.source,
          status: existing.status,
          format_id: existing.format_id ?? null,
          team_id: existing.team_id ?? null,
          team_version_id: existing.team_version_id ?? null,
          battle_id: existing.battle_id ?? null,
          turn_number: existing.turn_number ?? null,
          tags_json: existing.tags_json ?? "[]",
          difficulty: existing.difficulty ?? null,
          attempts_count: existing.attempts_count ?? 0,
          last_practiced_at: existing.last_practiced_at ?? null,
          best_rating: existing.best_rating ?? null,
        };
      }

      // Minimal creation: title derived from battle id/turn
      const id = randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const title = `Battle ${args.battle_id} — turn ${args.turn_number}`;

      db.prepare(
        `INSERT INTO practice_scenarios (id, source, status, title, subtitle, format_id, team_id, team_version_id, battle_id, turn_number, tags_json, difficulty, attempts_count, last_practiced_at, best_rating, snapshot_json, snapshot_hash, snapshot_created_at, created_at, updated_at) VALUES (?, 'battle_review', 'active', ?, NULL, NULL, NULL, NULL, ?, ?, '[]', NULL, 0, NULL, NULL, '{}', NULL, NULL, ?, ?)`
      ).run(id, title, args.battle_id, args.turn_number, now, now);

      const row = db.prepare(`SELECT * FROM practice_scenarios WHERE id = ?`).get(id) as LocalPracticeScenarioRow;
      return {
        id: row.id,
        title: row.title,
        subtitle: row.subtitle ?? null,
        source: row.source,
        status: row.status,
        format_id: row.format_id ?? null,
        team_id: row.team_id ?? null,
        team_version_id: row.team_version_id ?? null,
        battle_id: row.battle_id ?? null,
        turn_number: row.turn_number ?? null,
        tags_json: row.tags_json ?? "[]",
        difficulty: row.difficulty ?? null,
        attempts_count: row.attempts_count ?? 0,
        last_practiced_at: row.last_practiced_at ?? null,
        best_rating: row.best_rating ?? null,
      };
    });

    try { ipcMain.removeHandler("db:practice:createAttempt"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle("db:practice:createAttempt", (_e, args: {
      scenario_id: string;
      selected_action: SelectedActionLocal;
      rating?: PracticeOutcomeRatingLocal | null;
      summary?: string | null;
      result?: unknown;
      duration_ms?: number | null;
      sim_engine?: string | null;
      sim_version?: string | null;
      notes?: string | null;
    }) => {
      const db = getDb();
      const repo = practiceAttemptsRepo(db);
      const inserted: PracticeAttemptRowLocal = repo.insertAttempt({
        scenario_id: args.scenario_id,
        selected_action: args.selected_action,
        rating: args.rating ?? null,
        summary: args.summary ?? null,
        result: args.result ?? null,
        duration_ms: args.duration_ms ?? null,
        sim_engine: args.sim_engine ?? null,
        sim_version: args.sim_version ?? null,
        notes: args.notes ?? null,
      });

      // Update scenario denormalized stats
      try {
        db.prepare(`UPDATE practice_scenarios SET attempts_count = COALESCE(attempts_count,0) + 1, last_practiced_at = ? WHERE id = ?`).run(Math.floor(Date.now() / 1000), args.scenario_id);
      } catch {
        // ignore
      }

      return inserted;
    });
      try { ipcMain.removeHandler("db:practice:delete"); } catch (_err) { /* ignore if not registered */ }
      ipcMain.handle("db:practice:delete", (_e, id: string) => {
        const db = getDb();
        try {
          db.prepare(`DELETE FROM practice_scenarios WHERE id = ?`).run(id);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      });
    // AI: EV training recipe handler
    try { ipcMain.removeHandler("ai:evs:recipe"); } catch (_err) { /* ignore if not registered */ }
    ipcMain.handle(
      "ai:evs:recipe",
      async (
        _e,
        args: {
          species_name: string;
          nature: string | null;
          evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
        }
      ) => {
        const settings = getSettings();
        const key = settings.openrouter_api_key;
        const model = settings.openrouter_model ?? "gpt-4o-mini";
        if (!key) throw new Error("No OpenRouter API key configured");

        const resp = await getEvTrainingRecipe({ apiKey: key, model, request: args });
        return resp;
      }
    );
    // (Keep this file small to avoid duplicating packaged logic.)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ipc] failed to register db handlers:", err);
  }
}
