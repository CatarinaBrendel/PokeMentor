// electron/ipc/dbHandlers.ts
import { ipcMain } from "electron";
import { getDb } from "../db/index";

// -----------------------------
// Teams (new structure)
// -----------------------------
import { teamsRepo } from "../db/queries/teams/repo/teamsRepo";
import { teamImportService } from "../db/queries/teams/services/TeamImportService";
import { TeamActiveService } from "../db/queries/teams/services/TeamActiveService";

// -----------------------------
// Battles (new structure)
// -----------------------------
import { battleRepo } from "../db/queries/battles/repo/battleRepo";
import { battleIngestService } from "../db/queries/battles/services/BattleIngestService";
import { BattleLinkService } from "../db/queries/battles/services/BattleLinkService";

// -----------------------------
// Settings (unchanged)
// -----------------------------
import { getSettings, updateSettings } from "../db/queries/settings/settings";
import { getEvTrainingRecipe } from "../ai/openrouter";

/**
 * Centralized registration of DB-backed IPC handlers.
 *
 * Keep this file “composition-only”:
 * - create repos/services
 * - wire them to ipcMain.handle(...)
 * - do not embed SQL here
 */
export function registerDbHandlers() {
  // Build “composition root” objects once.
  // (Better-sqlite3 is synchronous; these are cheap wrappers.)
  const db = getDb();

  const teams = teamsRepo(db);
  const battles = battleRepo(db);

  const battleLink = BattleLinkService(db, {
    battleRepo: battles,
    teamsRepo: teams,
  });

  const battleIngest = battleIngestService(db, {
    battleRepo: battles,
    battleLinkService: battleLink,
  });

  const teamActive = new TeamActiveService(teams);

  const teamImport = teamImportService(db, {
    teamsRepo: teams,
    // This service triggers relinking of existing battles after import
    // via post-commit linker in teams/linking (which uses battles matchers).
    // If your TeamImportService already does it internally, nothing else needed here.
  });

  // Teams
  ipcMain.handle("db:teams:list", async () => teams.listTeams());
  ipcMain.handle("db:teams:getDetails", async (_evt, teamId: string) => teams.getTeamDetails(teamId));
  ipcMain.handle("db:teams:getActiveSummary", async () => teams.getActiveTeamSummary());
  ipcMain.handle("db:teams:getActiveActivity", async () => teams.getActiveTeamActivity());
  ipcMain.handle("db:teams:setTeamActive", async (_evt, teamId: string) => teamActive.setActiveTeam(teamId));
  ipcMain.handle("db:teams:delete", async (_evt, teamId: string) => teams.deleteTeam(teamId));
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => teamImport.importFromPokepaste(args));
  ipcMain.handle("db:teams:previewPokepaste", async (_evt, args) => teamImport.previewFromPokepaste(args));
  ipcMain.handle("db:teams:getEvRecipes", async (_evt, teamVersionId: string) =>
    teams.listTeamEvRecipes(teamVersionId)
  );
  ipcMain.handle(
    "db:teams:saveEvRecipe",
    async (_evt, args: { team_version_id: string; pokemon_set_id: string; source: "local" | "ai"; recipe_json: string }) =>
      teams.upsertTeamEvRecipe({ ...args, now: new Date().toISOString() })
  );

  // Battles
  ipcMain.handle("db:battles:list", async (_evt, args) => {
    const limit = args?.limit ?? 200;
    const offset = args?.offset ?? 0;

    return battles.listBattles({ limit, offset });
  });
  ipcMain.handle("db:battles:getDetails", async (_evt, battleId: string) => {
    const d = battles.getBattleDetails(battleId);
    if (!d) return null;

    const set = battles.getBattleSetSummary(battleId);

    return {
      battle: {
        ...d.battle,
        team_label: null,
        team_version_label: null,
        match_confidence: d.userLink?.match_confidence ?? null,
        match_method: d.userLink?.match_method ?? null,
      },
      set: set
        ? {
            id: set.id,
            game_number: set.game_number ?? null,
            total_games: set.total_games ?? (set.games.length || null),
            games: set.games.map((g) => ({
              battle_id: g.battle_id,
              replay_id: g.replay_id,
              played_at: g.played_at,
              game_number: g.game_number ?? 0, // frontend prefers number; see note below
            })),
          }
        : null,
      sides: d.sides,
      preview: d.preview,
      revealed: d.revealed,
      events: d.events,
    };
  });
  ipcMain.handle("db:battles:importReplays", async (_evt, args: { text: string }) => {
    return battleIngest.importFromReplaysText(args.text);
  });
  ipcMain.handle("db:battles:relinkBattle", async (_evt, battleId: string) => {
    return battleLink.autoLinkBattleForUserSide({ battleId, formatKeyHint: null });
  });

  // Settings
  ipcMain.handle("db:settings:get", async () => getSettings());
  ipcMain.handle(
    "db:settings:update",
    async (_evt, patch: Record<string, string | null>) => updateSettings(patch)
  );

  // AI
  ipcMain.handle("ai:evs:recipe", async (_evt, args) => {
    const settings = getSettings();
    if (!settings.ai_enabled) {
      throw new Error("AI assistant is disabled in Settings.");
    }
    const apiKey = settings.openrouter_api_key;
    if (!apiKey) {
      throw new Error("Missing OpenRouter API key. Configure it in Settings.");
    }

    const model = settings.openrouter_model ?? "openrouter/auto";
    return getEvTrainingRecipe({ apiKey, model, request: args });
  });
}
