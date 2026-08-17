# 前端交接：南美白对虾价格监测后端

状态：后端已完成生产构建和离线自动化测试；前端、Electron 壳与安装器未做。

## 你从哪里开始

1. 安装依赖并验证：`npm.cmd ci && npm.cmd run check && npm.cmd run build`。
2. 创建 Electron + React 前端，但保留当前 `src/` 作为主进程后端；不要把数据库或 Provider 放到 renderer。
3. 在 Electron `app.whenReady()` 后构造 `ShrimpMonitorBackend`，数据库路径用 `join(app.getPath("userData"), "shrimp-monitor.sqlite")`。
4. preload 仅暴露白名单 `invoke(method,payload)`、`onCollectionProgress(listener)`、`openExternal(url)`、`saveBytes(bytes)` 和 `readBytes()`。
5. UI 关闭时真正退出；`before-quit` 调用 `backend.close()`，不要创建托盘。

## 可直接调用的方法

统一入口：`await backend.invoke(method, payload)`。

| method | payload | 返回/用途 |
| --- | --- | --- |
| `settings.get` | 无 | 设置 + `hasApiKey`，永不返回 Key |
| `settings.test` | `{config, apiKey?}` | 六类连接状态 |
| `settings.save` | `{settings, apiKey?}` | 保存前测试；失败可留草稿但 `aiEnabled=false` |
| `settings.deleteApiKey` | 无 | 删除 Key 并禁用 AI |
| `collection.run` | `{kind:'daily'|'history'}` | 启动采集，返回最终进度 |
| `collection.cancel` | 无 | 请求取消 |
| `collection.progress` | 无 | 当前进度快照 |
| `quotes.list` | `{from?,to?,regionCode?,specification?,includeRejected?}` | 来源页、原始报价和日志关联数据 |
| `logs.list` | `{limit?}` | 采集/弃用/AI 失败日志 |
| `sources.fixed.list` | 无 | 固定来源列表 |
| `sources.fixed.add` | `{name,searchUrl}` | 新增用户来源 |
| `sources.fixed.setEnabled` | `{id,enabled}` | 启停来源 |
| `sources.fixed.restoreBuiltin` | 无 | 恢复内置来源启用状态 |
| `statistics.county` | 筛选器 | 县区日均序列 |
| `statistics.region` | 筛选器 | 区域日均序列，含 `countyCoverage` |
| `statistics.dashboard` | `{date,regionCode,specification,county?}` | 今日、同比、周环比、90 天位置、过期 |
| `export.excel` | 筛选器 | `Uint8Array`，主进程保存为 `.xlsx` |
| `backup.create` | 无 | `Uint8Array`，建议扩展名 `.shrimp-backup` |
| `backup.restore` | `{bytes:Uint8Array}` | 校验后事务恢复并删除 Key |

筛选器：`{from?:'YYYY-MM-DD', to?:'YYYY-MM-DD', regionCode?:'zhangzhou'|'yuedong'|'rudong', specification?:number}`。

采集进度不是 `invoke` 轮询的唯一方式；`backend.collection` 会派发 `progress` `CustomEvent`，主进程应转发到 renderer。事件体是 `CollectionProgress`，包含 `state/analyzed/limit/accepted/rejected/message`。

## 六个页面如何取数

- 今日行情：为每个关注区域/规格调用 `statistics.dashboard`。
- 地区行情：调用 `statistics.region` 和 `statistics.county`；`quotes.list` 中 `granularity='region'` 是区域参考价。
- 历史趋势：用 `statistics.region` 或 `statistics.county` 的稀疏日期点绘图；不要补点。
- 数据来源：`quotes.list({includeRejected:true})` + `logs.list`；系统浏览器打开 `source.url`。
- 导出与备份：获取字节后用 Electron `dialog.showSaveDialog` 写文件；恢复先用 `showOpenDialog` 读入字节。
- 设置：`settings.*` 和 `sources.fixed.*`。

## 首次启动流程

`settings.get().onboardingComplete` 为 false 时显示向导。先保存/测试 DeepSeek，成功后保存关注区域与规格，将 `onboardingComplete=true`，再执行 `collection.run({kind:'daily'})`。历史补采可在当日采集完成后调用 `kind:'history'`；后端仍受当日上限和缓存规则约束。

## Electron 打包必做

- Node 24 的 `node:sqlite` 必须在所用 Electron 版本中可用；选择带兼容 Node 的新版本 Electron，并在目标 Windows 10/11 x64 实机验证。
- `@napi-rs/canvas` 是原生模块，需要为 Electron 目标 ABI 重建，且从 ASAR 解包。
- Tesseract 运行文件以及 `@tesseract.js-data/chi_sim`、`@tesseract.js-data/eng` 必须进入产物；语言包已离线化。
- PDF.js worker/字体资源如打包器未自动复制，要加入 `extraResources`。
- NSIS 卸载配置不要删除 `app.getPath('userData')`，默认保留历史数据。
- 应用打包后做真实 OCR、PDF、Excel、备份恢复、凭据保存/删除冒烟测试。

## 测试与已知限制

当前 `npm.cmd test`：7 个测试文件、29 个测试，覆盖统计、校验、去重、HTML 清理、真实本地 OCR/扫描 PDF、DeepSeek 错误 JSON/状态分类、采集重试、注入拦截、Excel、备份恢复。测试无真实 API Key/实时网络。

仍需前端阶段完成：六页面 UI、preload 白名单、打开外链、保存/读取文件对话框、主要页面 E2E、Electron Builder/NSIS 配置和最终 `.exe`。真实公开站搜索质量与默认 DeepSeek 模型可用性只能通过用户自己的网络和 Key 验证；搜索失败绝不能生成替代价格。
