"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  teams: {
    importPokepaste: (args) => electron.ipcRenderer.invoke("db:teams:importPokepaste", args),
    listTeams: () => electron.ipcRenderer.invoke("db:teams:list"),
    deleteTeam: (teamId) => electron.ipcRenderer.invoke("db:teams:delete", teamId),
    getDetails: (teamId) => electron.ipcRenderer.invoke("db:teams:getDetails", teamId),
    setTeamActive: (teamId) => electron.ipcRenderer.invoke("db:teams:setTeamActive", teamId),
    getActiveSummary: () => electron.ipcRenderer.invoke("db:teams:getActiveSummary"),
    getActiveActivity: () => electron.ipcRenderer.invoke("db:teams:getActiveActivity")
  },
  battles: {
    importReplays: (args) => electron.ipcRenderer.invoke("db:battles:importReplays", args),
    list: (args) => electron.ipcRenderer.invoke("db:battles:list", args),
    getDetails: (battleId) => electron.ipcRenderer.invoke("db:battles:getDetails", battleId)
  },
  settings: {
    get: () => electron.ipcRenderer.invoke("db:settings:get"),
    update: (args) => electron.ipcRenderer.invoke("db:settings:update", args)
  }
});
