// electron/ipc/dbHandlers.ts
import { ipcMain } from "electron";
import { importTeamFromPokepaste } from "../db/queries/teams";

export function registerDbHandlers() {
     ipcMain.handle("db:teams:importPokepaste", async (_evt, args: {
      url: string;
      name?: string;
      format_ps?: string;
    }) => {
      return importTeamFromPokepaste(args);
    });
}