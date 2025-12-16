// electron/ipc/dbHandlers.ts
import { ipcMain } from "electron";
import { importTeamFromPokepaste } from "../db/queries/teams/importPokepaste";
import { listTeams, setTeamActive } from "../db/queries/teams/listTeams";
import { deleteTeam } from "../db/queries/teams/deleteTeam";
import { getTeamDetails } from "../db/queries/teams/getTeamDetails";

ipcMain.removeHandler("db:teams:importPokepaste");
ipcMain.removeHandler("db:teams:list");

export function registerDbHandlers() {
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => {
    const result = importTeamFromPokepaste(args);

    return {
      team_id: (await result).team_id,
      version_id: (await result).version_id,
      version_num: (await result).version_num,
      slots_inserted: (await result).slots_inserted,
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
}