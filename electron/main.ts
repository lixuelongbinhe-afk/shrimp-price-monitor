import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ShrimpMonitorBackend } from "../src/index.js";
import type { CollectionProgress } from "../src/domain/models.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

const ALLOWED_METHODS = new Set([
  "settings.get", "settings.test", "settings.save", "settings.deleteApiKey",
  "collection.run", "collection.cancel", "collection.progress",
  "quotes.list", "logs.list",
  "sources.fixed.list", "sources.fixed.add", "sources.fixed.setEnabled", "sources.fixed.restoreBuiltin",
  "statistics.county", "statistics.region", "statistics.dashboard",
  "export.excel", "backup.create", "backup.restore"
]);

let backend: ShrimpMonitorBackend | null = null;
let backendClosed = false;

function resolveDatabasePath(): string {
  const override = process.env.SHRIMP_MONITOR_DB;
  if (override) return override;
  if (app.isPackaged) return join(app.getPath("userData"), "shrimp-monitor.sqlite");
  return join(app.getAppPath(), "dev-data", "shrimp-monitor.sqlite");
}

function broadcastProgress(progress: CollectionProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("collection:progress", progress);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("backend:invoke", async (_event, method: unknown, payload: unknown) => {
    if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) {
      throw new Error(`不允许调用的后端方法：${String(method)}`);
    }
    if (!backend) throw new Error("后端尚未初始化");
    return backend.invoke(method, payload ?? {});
  });

  ipcMain.handle("shell:openExternal", async (_event, url: unknown) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("只允许打开 HTTP/HTTPS 链接");
    await shell.openExternal(url);
  });

  ipcMain.handle("file:save", async (_event, bytes: unknown, suggestedName: unknown) => {
    if (!(bytes instanceof Uint8Array)) throw new Error("保存内容格式无效");
    const name = typeof suggestedName === "string" && suggestedName.length > 0 ? suggestedName : "导出文件";
    const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
    const filters = extension
      ? [{ name: extension.toUpperCase(), extensions: [extension] }, { name: "所有文件", extensions: ["*"] }]
      : [{ name: "所有文件", extensions: ["*"] }];
    const result = await dialog.showSaveDialog({ title: "保存文件", defaultPath: name, filters });
    if (result.canceled || !result.filePath) return { saved: false as const };
    await writeFile(result.filePath, Buffer.from(bytes));
    return { saved: true as const, filePath: result.filePath };
  });

  ipcMain.handle("file:read", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择备份文件",
      properties: ["openFile"],
      filters: [
        { name: "备份文件", extensions: ["shrimp-backup"] },
        { name: "所有文件", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return { bytes: null };
    const filePath = result.filePaths[0] as string;
    const bytes = await readFile(filePath);
    return { bytes, filePath };
  });
}

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(moduleDirectory, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(moduleDirectory, "../renderer/index.html"));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  void app.whenReady().then(() => {
    backend = new ShrimpMonitorBackend(resolveDatabasePath());
    backend.collection.addEventListener("progress", (event) => {
      broadcastProgress((event as CustomEvent<CollectionProgress>).detail);
    });
    backend.start();
    registerIpcHandlers();
    createMainWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    if (!backendClosed) {
      backendClosed = true;
      backend?.close();
    }
  });
}