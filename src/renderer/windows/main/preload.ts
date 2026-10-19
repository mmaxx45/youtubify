// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";
import { WindowsEventArguments } from "~shared/types";
import { MemoryStoreSchema, StoreSchema } from "~shared/store/schema";
import MemoryStore from "../../store-ipc/memory-store";
import Store from "../../store-ipc/store";

const memoryStore = new MemoryStore<MemoryStoreSchema>();
// For the Youtubify UI's Settings page (same store and keys as the settings window)
const store = new Store<StoreSchema>();

contextBridge.exposeInMainWorld("ytmd", {
  minimizeWindow: () => ipcRenderer.send("mainWindow:minimize"),
  maximizeWindow: () => ipcRenderer.send("mainWindow:maximize"),
  restoreWindow: () => ipcRenderer.send("mainWindow:restore"),
  closeWindow: () => ipcRenderer.send("mainWindow:close"),
  handleWindowEvents: (callback: (event: Electron.IpcRendererEvent, args: WindowsEventArguments) => void) =>
    ipcRenderer.on("mainWindow:stateChanged", callback),
  requestWindowState: () => ipcRenderer.send("mainWindow:requestWindowState"),
  openSettingsWindow: () => ipcRenderer.send("settingsWindow:open"),
  switchFocus: (context: string) => ipcRenderer.send("ytmView:switchFocus", context),
  ytmViewNavigateDefault: () => ipcRenderer.send("ytmView:navigateDefault"),
  ytmViewRecreate: () => ipcRenderer.send("ytmView:recreate"),
  memoryStore: {
    set: (key: string, value: unknown) => memoryStore.set(key, value),
    get: async (key: keyof MemoryStoreSchema) => await memoryStore.get(key),
    onStateChanged: (callback: (newState: MemoryStoreSchema, oldState: MemoryStoreSchema) => void) => memoryStore.onStateChanged(callback)
  },
  store: {
    set: (key: string, value: unknown) => store.set(key, value),
    get: async (key: keyof StoreSchema) => await store.get(key),
    onDidAnyChange: (callback: (newState: StoreSchema, oldState: StoreSchema) => void) => store.onDidAnyChange(callback)
  },
  restartApplicationForUpdate: () => ipcRenderer.send("app:restartApplicationForUpdate")
});

// Youtubify UI <-> hidden YouTube Music engine (see main/ytm-bridge)
contextBridge.exposeInMainWorld("ytf", {
  getConfig: () => ipcRenderer.invoke("ytf:config"),
  innertube: (endpoint: string, body: unknown) => ipcRenderer.invoke("ytf:innertube", endpoint, body),
  command: (command: string, value?: unknown) => ipcRenderer.send("ytf:command", command, value),
  getPlayerState: () => ipcRenderer.invoke("ytf:getPlayerState"),
  getSession: () => ipcRenderer.invoke("ytf:session"),
  queueAdd: (target: unknown) => ipcRenderer.invoke("ytf:queueAdd", target),
  queueEdit: (edit: unknown) => ipcRenderer.invoke("ytf:queueEdit", edit),
  signIn: () => ipcRenderer.send("ytf:signIn"),
  closeYtmView: () => ipcRenderer.send("ytf:closeYtmView"),
  signOut: () => ipcRenderer.send("ytf:signOut"),
  openExternal: (url: string) => ipcRenderer.send("ytf:openExternal", url),
  getAppVersion: () => ipcRenderer.invoke("ytf:appVersion"),
  quit: () => ipcRenderer.send("ytf:app", "quit"),
  restart: () => ipcRenderer.send("ytf:app", "restart"),
  onYtmVisible: (callback: (visible: boolean) => void) => ipcRenderer.on("ytf:ytmVisible", (_event, visible: boolean) => callback(visible)),
  onSessionChanged: (callback: () => void) => ipcRenderer.on("ytf:sessionChanged", () => callback()),
  onPlayerState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: unknown) => callback(state);
    ipcRenderer.on("ytf:playerState", listener);
    return () => ipcRenderer.removeListener("ytf:playerState", listener);
  }
});
