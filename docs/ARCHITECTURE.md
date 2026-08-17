# 后端架构

依赖方向：`domain` ← `core` ← `infrastructure/providers` ← `services` ← `application`。纯统计与校验模块不访问网络或数据库。

## 关键模块

| 模块 | 职责 |
| --- | --- |
| `src/domain/models.ts` | IPC 可序列化领域类型 |
| `src/domain/providers.ts` | AI、搜索、OCR、PDF、凭据抽象 |
| `src/core/validation.ts` | 字段、区域、口径、单位、证据校验 |
| `src/core/deduplication.ts` | URL、内容哈希、原作者与相似度去重 |
| `src/core/statistics.ts` | 异常排除与全部统计口径 |
| `src/providers/deepseek.ts` | OpenAI 兼容的 DeepSeek Chat Completions 与 JSON Schema |
| `src/providers/document-processor.ts` | HTML/图片/PDF 获取、清理、本地 OCR |
| `src/infrastructure/database.ts` | Node 24 内置 `node:sqlite` 数据访问与迁移 |
| `src/infrastructure/windows-credential-store.ts` | Windows Credential API 封装 |
| `src/services/collection-service.ts` | 可取消采集编排、额度、缓存、重试、日志 |
| `src/services/statistics-service.ts` | 数据库到展示模型的统计查询 |
| `src/services/export-service.ts` | Excel 两工作表导出 |
| `src/services/backup-service.ts` | 不含 Key 的备份/恢复 |
| `src/application.ts` | Electron 可调用的稳定门面 |

## 安全不变量

1. DeepSeek Key 只在 `CredentialStore` 中存在；SQLite schema 没有 Key 字段。
2. Key 不进入日志、AI 提示、Excel或备份；恢复前删除本机现有 Key。
3. 网页内容用 `<document>` 数据边界包裹；系统提示明确禁止服从网页指令。
4. 发现常见提示词注入模式时整页弃用，不发送 AI。
5. AI 输出还要经过 JSON 结构、字段、证据、区域、单位、数值校验。
6. AI 不参与均价、同比、环比或历史位置计算。

## 数据口径

- 县区报价才能进入县区日均；区域级报价只作为区域参考价保存。
- 同日/同县区/同规格，至少 3 个独立来源才做中位数异常检查，偏离超过 20% 排除。
- 区域均价先算每个有报价县区的日均，再按县区等权平均。
- 同比只匹配去年同月同日；自然周为周一到周日；缺日不填值。
- 90 天至少 30 个有效日，排名前 25%/后 25% 为高位/低位。
