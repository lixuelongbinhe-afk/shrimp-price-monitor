# 南美白对虾塘口价格监测工具 — 本地后端

这是一个供 Electron 主进程直接嵌入的 TypeScript 后端。它不包含前端，也不启动 HTTP 服务器；所有数据、配置和采集日志仅保存在本机，API Key 使用 Windows Credential Manager 保存。

## 已实现

- `AiProvider` / DeepSeek、`SearchProvider` / 基础网页搜索的可替换接口
- HTML 正文清洗、独立图片 OCR、文本 PDF 与扫描 PDF OCR
- 严格报价校验、提示词注入检测、跨站转载去重、异常价排除
- SQLite 持久化、每天 20 页硬上限、8/7/5 区域配额与剩余额度重分配
- 县区日均价、县区等权区域均价、严格同比、自然周环比、90 天位置、7 天过期
- 后台采集、进度事件、取消、启动补采和定时采集
- Excel 导出、带 SHA-256 校验的完整备份与事务恢复
- Windows Credential Manager 安全凭据；备份恢复会删除已有 Key 并禁用 AI
- 中英文 Tesseract 语言数据随包安装，OCR 首次使用不需要下载语言包

## 开发

要求 Windows 10/11 x64、Node.js 24+。PowerShell 若禁止执行 `npm.ps1`，使用 `npm.cmd`：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

构建产物在 `dist/`。`npm test` 会可重复生成固定 OCR 图片和扫描 PDF 样本，再运行全部离线测试；它不需要真实 API Key 或实时网络。

## Electron 主进程最小接入

```ts
import { app, ipcMain } from "electron";
import { join } from "node:path";
import { ShrimpMonitorBackend } from "shrimp-price-monitor-backend";

await app.whenReady();
const backend = new ShrimpMonitorBackend(join(app.getPath("userData"), "shrimp-monitor.sqlite"));

ipcMain.handle("backend:invoke", (_event, method: string, payload: unknown) =>
  backend.invoke(method, payload)
);

backend.collection.addEventListener("progress", (event) => {
  const progress = (event as CustomEvent).detail;
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("collection:progress", progress);
});

backend.start();
app.on("before-quit", () => backend.close());
```

渲染进程不要直接导入本包，也不要开启 `nodeIntegration`。通过 preload 中的 `contextBridge` 白名单转发 `backend:invoke`；保存文件、恢复文件和打开来源链接都由主进程处理。

完整方法、页面数据映射和打包注意事项见 [HANDOFF.md](./HANDOFF.md)。

## 数据目录与卸载

建议数据库放在 `app.getPath("userData")`。Electron Builder/NSIS 卸载器不得删除该目录，这样默认保留历史数据。退出应用时调用 `backend.close()`，不创建托盘，不保留后台进程。

## 当前限制

- 基础搜索使用公开 HTML 搜索结果，遇到验证码、登录、付费墙或反爬会如实记录失败，不绕过限制。
- DeepSeek 默认模型按需求设为 `deepseek-v4-flash`，模型是否在用户账户可用只能在真实连接测试时确认。
- 固定来源当前是优先级/信任标识，不包含针对各站点的脆弱专用爬虫；后续可通过新的 `SearchProvider` 增强。
- 本仓库交付的是后端，不含 Electron UI、E2E 页面测试或 Windows 安装器。

---

# 用户使用说明（桌面应用版）

## 安装与启动

1. 在 Windows 10/11 x64 上运行安装器 `南美白对虾价格监测-Setup-x.x.x.exe`。
2. 安装为当前用户安装，无需管理员权限；卸载时**不会删除**历史价格数据（保留在 `%APPDATA%\南美白对虾价格监测`）。
3. 所有数据仅存本机；DeepSeek API Key 保存在 Windows 凭据管理器，不写入数据库、日志、Excel 或备份文件。

## 首次使用（约 3 分钟）

1. 启动后进入配置向导：填入 DeepSeek 接口地址、模型与 API Key，点击「测试连接」，成功后才能继续。
2. 选择关注区域（漳州 / 粤东 / 如东）与规格（30–80 尾/斤）。
3. 点击「完成并开始采集」，程序立即执行当日采集，进度实时显示；每天最多分析 20 个网页。
4. 当日采集完成后，可在「今日行情」页点「补采历史」回填更早的数据（同样受每日上限约束，可分多天补）。

## 六个页面

- **今日行情**：每个关注区域×规格一张卡片——当日均价、同比、周环比、90 天位置（高/中/低位）、数据过期标记。
- **地区行情**：区域日均（县区等权）、县区日均、区域参考价三张表，可按规格与日期范围筛选。
- **历史趋势**：折线图按真实采集日期绘点，缺数据的日期如实留空，不补点。
- **数据来源**：全部原始报价（含被弃用及原因）与采集日志；点来源链接用系统浏览器打开原网页。
- **导出备份**：按筛选条件导出 Excel；创建/恢复完整备份（`.shrimp-backup`，带 SHA-256 校验）。恢复会覆盖当前全部数据并删除本机 API Key，需重新配置。
- **设置**：DeepSeek 配置与连接测试、每日上限（1–20）、定时采集时间、关注区域与规格、固定来源启停与新增。

## 常见问题

- **采集失败/搜索无结果**：公开网站可能有验证码或反爬限制，程序会如实记录失败原因到「数据来源 → 采集日志」，不会编造价格。稍后重试或更换网络。
- **模型不可用**：默认模型 `deepseek-v4-flash` 需你的账户支持；在设置页改为可用模型并重新测试保存。
- **定时采集**：按设置页的时间每天自动执行，需保持程序运行；关闭窗口即完全退出，无后台驻留。

## 开发者命令

```powershell
npm.cmd ci            # 安装依赖
npm.cmd run seed      # 生成开发用仿真数据（dev-data/，仅开发）
npm.cmd run dev       # 开发模式（热更新）
npm.cmd run check     # 类型检查 + 后端离线测试（29 个）
npm.cmd run e2e       # 构建 + Playwright 端到端测试
npm.cmd run dist      # 打包 NSIS 安装器到 release/
```