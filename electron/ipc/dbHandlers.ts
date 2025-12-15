// electron/ipc/dbHandlers.ts
import { ipcMain } from "electron";
import type { TeamInput, TeamInsertResult, TeamRow } from ".";
import { listTeams, insertTeam } from "../db/queries/teams";

export function registerDbHandlers() {
  ipcMain.handle("db:teams:list", async (): Promise<TeamRow[]> => {
    return listTeams();
  });

  ipcMain.handle(
    "db:teams:insert",
    async (_evt, team: TeamInput): Promise<TeamInsertResult> => {
      const id = insertTeam(team);
      return { ok: true, id };
    }
  );
}