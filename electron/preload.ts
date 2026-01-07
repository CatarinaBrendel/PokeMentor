import { ipcRenderer, contextBridge } from 'electron'
import { TeamListRow } from './db/queries/teams/teams.types'
import { PracticeScenarioRow } from './db/queries/practice/repo/practiceScenariosRepo';

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
    importPokepaste: (args: { url?: string; name?: string; format_ps?: string; paste_text?: string }) =>
      ipcRenderer.invoke("db:teams:importPokepaste", args),
    previewPokepaste: (args: { url?: string; name?: string; format_ps?: string; paste_text?: string }) =>
      ipcRenderer.invoke("db:teams:previewPokepaste", args),
    getEvRecipes: (teamVersionId: string) =>
      ipcRenderer.invoke("db:teams:getEvRecipes", teamVersionId),
    saveEvRecipe: (args: { team_version_id: string; pokemon_set_id: string; source: "local" | "ai"; recipe_json: string }) =>
      ipcRenderer.invoke("db:teams:saveEvRecipe", args),

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

    list: (args?: { limit?: number; offset?: number }) => ipcRenderer.invoke("db:battles:list", args),
    
    getDetails: (battleId: string) => ipcRenderer.invoke("db:battles:getDetails", battleId),
  },
  settings: {
    get: () => ipcRenderer.invoke("db:settings:get"),
    
    update: (args: {
      showdown_username?: string | null;
      openrouter_api_key?: string | null;
      openrouter_model?: string | null;
      ai_enabled?: boolean | null;
    }) =>
      ipcRenderer.invoke("db:settings:update", args),
  },
  ai: {
    getEvTrainingRecipe: (args: {
      species_name: string;
      nature: string | null;
      evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
    }) => ipcRenderer.invoke("ai:evs:recipe", args),
  },
  dashboard: {
    getKpis: () => ipcRenderer.invoke("db:dashboard:getKpis"),
  },
  practice: {
    listMyScenarios: () =>
    ipcRenderer.invoke("db:practice:listMyScenarios") as Promise<PracticeScenarioRow[]>,

    createFromBattleTurn: (args: { battle_id: string; turn_number: number }) =>
      ipcRenderer.invoke("db:practice:createFromBattleTurn", args) as Promise<PracticeScenarioRow>,

    getScenario: (id: string) =>
      ipcRenderer.invoke("db:practice:getScenario", id) as Promise<PracticeScenarioRow | null>,
    
    getDetails: (id: string) => ipcRenderer.invoke("db:practice:getDetails", id),
  },        
});
