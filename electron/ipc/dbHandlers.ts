// electron/ipc/dbHandlers.ts
import { ipcMain } from "electron";
import { importTeamFromPokepaste } from "../db/queries/teams/importPokepaste";
import { listTeams, setTeamActive, getActiveTeamActivity } from "../db/queries/teams/listTeams";
import { deleteTeam } from "../db/queries/teams/deleteTeam";
import { getTeamDetails,  getActiveTeamSummary } from "../db/queries/teams/getTeamDetails";
import { importBattlesFromReplaysText } from "../db/queries/battles/importBattlesFromReplaysText"
import { listBattles, getBattleDetails } from "../db/queries/battles/battles";
import { getSettings, updateSettings } from "../db/queries/settings/settings";

ipcMain.removeHandler("db:teams:importPokepaste");
ipcMain.removeHandler("db:teams:list");
ipcMain.removeHandler("db:battles:importReplays");
ipcMain.removeHandler("db:settings:get");
ipcMain.removeHandler("db:settings:update");

export function registerDbHandlers() {
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => {
    const result = await importTeamFromPokepaste(args);

    return {
      team_id: result.team_id,
      version_id: result.version_id,
      version_num: result.version_num,
      slots_inserted: result.slots_inserted,
    };
  });

    ipcMain.handle("db:teams:list", async () => {
      return listTeams();
    });

    ipcMain.handle("db:teams:delete", async (_evt, teamId: string) => {
      return deleteTeam(teamId);
    });

    ipcMain.handle("db:teams:getDetails", async (_evt, teamId: string) => {
      return getTeamDetails(teamId);
    });

    ipcMain.handle("db:teams:setTeamActive", (_evt, teamId: string) => {
      return setTeamActive(teamId);
    });

    ipcMain.handle("db:teams:getActiveSummary", () => {
      return getActiveTeamSummary();
    });

    ipcMain.handle("db:teams:getActiveActivity", () => {
      return getActiveTeamActivity();
    });

    ipcMain.handle("db:battles:importReplays", async (_evt, args: { text: string }) => {
      return importBattlesFromReplaysText(args);
    });

    ipcMain.handle("db:battles:list", async (_evt, args?: { limit?: number; offset?: number }) => {
      return listBattles(args);
    });

    ipcMain.handle("db:settings:get", async () => {
      return getSettings();
    });

    ipcMain.handle("db:settings:update", async (_evt, args: { showdown_username?: string | null }) => {
      return updateSettings(args);
    });

    ipcMain.handle("db:battles:getDetails", async (_evt, battleId: string) => {
      return getBattleDetails(battleId);
    });

}