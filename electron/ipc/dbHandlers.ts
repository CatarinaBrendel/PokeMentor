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
import { getSettings, updateSettings } from "../db/queries/settings/settings";
import { getEvTrainingRecipe } from "../ai/openrouter";

// Expose a register function expected by `electron/main.ts`.
export function registerDbHandlers() {
  try {
    // Dashboard KPIs
    try { ipcMain.removeHandler("db:dashboard:getKpis"); } catch {}
    ipcMain.handle("db:dashboard:getKpis", () => {
      const db = getDb();
      return dashboardRepo(db).getKpis();
    });

    // Teams handlers (minimal subset used by the renderer)
    try { ipcMain.removeHandler("db:teams:list"); } catch {}
    ipcMain.handle("db:teams:list", () => {
      const db = getDb();
      return teamsRepo(db).listTeams();
    });

    try { ipcMain.removeHandler("db:teams:getActiveActivity"); } catch {}
    ipcMain.handle("db:teams:getActiveActivity", () => {
      const db = getDb();
      return teamsRepo(db).getActiveTeamActivity();
    });

    try { ipcMain.removeHandler("db:teams:getActiveSummary"); } catch {}
    ipcMain.handle("db:teams:getActiveSummary", () => {
      const db = getDb();
      return teamsRepo(db).getActiveTeamSummary();
    });

    try { ipcMain.removeHandler("db:teams:getDetails"); } catch {}
    ipcMain.handle("db:teams:getDetails", (_e, teamId: string) => {
      const db = getDb();
      return teamsRepo(db).getTeamDetails(teamId);
    });

    try { ipcMain.removeHandler("db:teams:getEvRecipes"); } catch {}
    ipcMain.handle("db:teams:getEvRecipes", (_e, teamVersionId: string) => {
      const db = getDb();
      return teamsRepo(db).listTeamEvRecipes(teamVersionId);
    });

    try { ipcMain.removeHandler("db:teams:saveEvRecipe"); } catch {}
    ipcMain.handle("db:teams:saveEvRecipe", (_e, args: any) => {
      const db = getDb();
      // upsertTeamEvRecipe expects now; provide ISO timestamp
      teamsRepo(db).upsertTeamEvRecipe({ ...args, now: new Date().toISOString() });
      return { ok: true };
    });

    try { ipcMain.removeHandler("db:teams:setTeamActive"); } catch {}
    ipcMain.handle("db:teams:setTeamActive", (_e, teamId: string) => {
      const db = getDb();
      teamsRepo(db).setActiveTeam(teamId);
      return { ok: true };
    });

    try { ipcMain.removeHandler("db:teams:delete"); } catch {}
    ipcMain.handle("db:teams:delete", (_e, teamId: string) => {
      const db = getDb();
      teamsRepo(db).deleteTeam(teamId);
      return { ok: true };
    });

    // Settings handlers
    try { ipcMain.removeHandler("db:settings:get"); } catch {}
    ipcMain.handle("db:settings:get", () => getSettings());

    try { ipcMain.removeHandler("db:settings:update"); } catch {}
    ipcMain.handle("db:settings:update", (_e, args: any) => updateSettings(args));

    // Other handlers are provided in the packaged build. Add more here as needed.
    // AI: EV training recipe handler
    try { ipcMain.removeHandler("ai:evs:recipe"); } catch {}
    ipcMain.handle("ai:evs:recipe", async (_e, args: any) => {
      const settings = getSettings();
      const key = settings.openrouter_api_key;
      const model = settings.openrouter_model ?? "gpt-4o-mini";
      if (!key) throw new Error("No OpenRouter API key configured");

      const resp = await getEvTrainingRecipe({ apiKey: key, model, request: args });
      return resp;
    });
    // (Keep this file small to avoid duplicating packaged logic.)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[ipc] failed to register db handlers:", err);
  }
}
