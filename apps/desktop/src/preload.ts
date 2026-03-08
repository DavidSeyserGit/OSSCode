import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const ENVIRONMENT_REPORT_CHANNEL = "desktop:environment-report";
const BACKEND_RUNTIME_STATE_CHANNEL = "desktop:backend-runtime-state";
const BACKEND_RUNTIME_GET_STATE_CHANNEL = "desktop:backend-runtime-get-state";
const BACKEND_RESTART_CHANNEL = "desktop:backend-restart";
const OPEN_LOG_DIRECTORY_CHANNEL = "desktop:open-log-directory";
const SHOW_NOTIFICATION_CHANNEL = "desktop:show-notification";
const wsUrl = process.env.OSSCODE_DESKTOP_WS_URL ?? null;

contextBridge.exposeInMainWorld("desktopBridge", {
  getWsUrl: () => wsUrl,
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  getEnvironmentReport: (input) => ipcRenderer.invoke(ENVIRONMENT_REPORT_CHANNEL, input),
  getBackendRuntimeState: () => ipcRenderer.invoke(BACKEND_RUNTIME_GET_STATE_CHANNEL),
  restartBackend: () => ipcRenderer.invoke(BACKEND_RESTART_CHANNEL),
  openLogDirectory: () => ipcRenderer.invoke(OPEN_LOG_DIRECTORY_CHANNEL),
  showNotification: (input) => ipcRenderer.invoke(SHOW_NOTIFICATION_CHANNEL, input),
  onBackendRuntimeState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(BACKEND_RUNTIME_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(BACKEND_RUNTIME_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
