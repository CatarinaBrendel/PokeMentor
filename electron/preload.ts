import { ipcRenderer, contextBridge } from 'electron'
import { TeamListRow } from './db/queries/teams/teams.types'

export type ImportBattlesResult = {
  okCount: number;
  failCount: number;
  rows: Array<
    | { input: string; ok: true; replayId: string; battleId: string }
    | { input: string; ok: false; error: string }
  >;
};

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// --------- High-level PokéMentor API ---------
contextBridge.exposeInMainWorld("api", {
  teams: {
    importPokepaste: (args: { url: string; name?: string; format_ps?: string }) =>
      ipcRenderer.invoke("db:teams:importPokepaste", args),

    listTeams: () =>
      ipcRenderer.invoke("db:teams:list") as Promise<TeamListRow[]>,

    deleteTeam: (teamId: string) =>
      ipcRenderer.invoke("db:teams:delete", teamId),

    getDetails: (teamId: string) =>
      ipcRenderer.invoke("db:teams:getDetails", teamId),

    setTeamActive: (teamId: string) =>
      ipcRenderer.invoke("db:teams:setTeamActive", teamId),

    getActiveSummary: () =>
      ipcRenderer.invoke("db:teams:getActiveSummary"),

    getActiveActivity: () => ipcRenderer.invoke("db:teams:getActiveActivity"),
    
  },
  battles: {
    importReplays: (args: { text: string }) =>
      ipcRenderer.invoke("db:battles:importReplays", args) as Promise<ImportBattlesResult>,

    list: (args?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke("db:battles:list", args),

    getDetails: (battleId: string) => ipcRenderer.invoke("db:battles:getDetails", battleId),
  },
  settings: {
    get: () => ipcRenderer.invoke("db:settings:get"),
    update: (args: { showdown_username?: string | null }) =>
      ipcRenderer.invoke("db:settings:update", args),
  },
});
