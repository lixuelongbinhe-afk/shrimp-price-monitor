import { contextBridge, ipcRenderer } from "electron";

const bridge = {
  invoke: (method: string, payload?: unknown): Promise<unknown> =>
    ipcRenderer.invoke("backend:invoke", method, payload),

  onCollectionProgress: (listener: (progress: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => listener(progress);
    ipcRenderer.on("collection:progress", handler);
    return () => {
      ipcRenderer.removeListener("collection:progress", handler);
    };
  },

  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("shell:openExternal", url),

  saveBytes: (bytes: Uint8Array, suggestedName: string): Promise<unknown> =>
    ipcRenderer.invoke("file:save", bytes, suggestedName),

  readBytes: (): Promise<unknown> => ipcRenderer.invoke("file:read")
};

contextBridge.exposeInMainWorld("shrimp", bridge);