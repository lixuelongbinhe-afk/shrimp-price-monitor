import { createHash } from "node:crypto";
import type { UserSettings } from "../domain/models.js";
import { AppDatabase } from "../infrastructure/database.js";
import type { CredentialStore } from "../domain/providers.js";

interface BackupEnvelope {
  format: "shrimp-price-monitor-backup";
  version: 1;
  createdAt: string;
  payload: {
    settings: UserSettings;
    sources: Record<string, unknown>[];
    quotes: Record<string, unknown>[];
    logs: Record<string, unknown>[];
    fixedSources: Record<string, unknown>[];
  };
  checksum: string;
}

export class BackupService {
  constructor(private readonly database: AppDatabase, private readonly credentials?: CredentialStore) {}

  create(): Uint8Array {
    const payload: BackupEnvelope["payload"] = {
      settings: { ...this.database.getSettings(), aiEnabled: false },
      sources: rows(this.database, "SELECT * FROM sources ORDER BY id"),
      quotes: rows(this.database, "SELECT * FROM quotes ORDER BY id"),
      logs: rows(this.database, "SELECT * FROM collection_logs ORDER BY id"),
      fixedSources: rows(this.database, "SELECT * FROM fixed_sources ORDER BY id")
    };
    const serialized = stableJson(payload);
    const envelope: BackupEnvelope = { format: "shrimp-price-monitor-backup", version: 1, createdAt: new Date().toISOString(), payload, checksum: digest(serialized) };
    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  async restore(bytes: Uint8Array): Promise<void> {
    let envelope: BackupEnvelope;
    try { envelope = JSON.parse(new TextDecoder().decode(bytes)) as BackupEnvelope; } catch { throw new Error("备份文件不是有效 JSON"); }
    if (envelope.format !== "shrimp-price-monitor-backup" || envelope.version !== 1) throw new Error("不支持的备份格式或版本");
    if (digest(stableJson(envelope.payload)) !== envelope.checksum) throw new Error("备份校验失败，文件可能已损坏");
    validateBackup(envelope);
    await this.credentials?.delete();
    const db = this.database.db;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM quotes; DELETE FROM sources; DELETE FROM collection_logs; DELETE FROM collection_runs; DELETE FROM document_cache; DELETE FROM fixed_sources;");
      for (const item of envelope.payload.sources) db.prepare(`INSERT INTO sources(id,name,url,original_publisher,title,published_at,collected_at,content_hash,enabled,trusted) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        ...sqlValues(item.id, item.name, item.url, item.original_publisher ?? null, item.title, item.published_at, item.collected_at, item.content_hash, item.enabled, item.trusted));
      for (const item of envelope.payload.quotes) db.prepare(`INSERT INTO quotes(id,source_id,species,region_code,county,granularity,quoted_at,specification,specification_unit,price,price_unit,price_type,evidence,status,exclusion_reason,included_in_average) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        ...sqlValues(item.id, item.source_id, item.species, item.region_code, item.county ?? null, item.granularity, item.quoted_at, item.specification, item.specification_unit, item.price, item.price_unit, item.price_type, item.evidence, item.status, item.exclusion_reason ?? null, item.included_in_average));
      for (const item of envelope.payload.logs) db.prepare("INSERT INTO collection_logs(id,run_id,level,stage,message,url,created_at) VALUES(?,?,?,?,?,?,?)").run(
        ...sqlValues(item.id, item.run_id ?? null, item.level, item.stage, item.message, item.url ?? null, item.created_at));
      for (const item of envelope.payload.fixedSources) db.prepare("INSERT INTO fixed_sources(id,name,search_url,enabled,builtin,trusted) VALUES(?,?,?,?,?,?)").run(
        ...sqlValues(item.id, item.name, item.search_url, item.enabled, item.builtin, item.trusted));
      this.database.saveSettings({ ...envelope.payload.settings, aiEnabled: false });
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
}

function rows(database: AppDatabase, sql: string): Record<string, unknown>[] { return database.db.prepare(sql).all() as Record<string, unknown>[]; }
function sqlValues(...values: unknown[]): Array<string | number | bigint | Uint8Array | null> {
  return values.map((value) => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    throw new Error("备份包含不可写入 SQLite 的字段值");
  });
}
function stableJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function validateBackup(value: BackupEnvelope): void {
  if (!value.payload || !value.payload.settings || !Array.isArray(value.payload.sources) || !Array.isArray(value.payload.quotes) || !Array.isArray(value.payload.logs) || !Array.isArray(value.payload.fixedSources)) throw new Error("备份内容缺少必要字段");
  const raw = JSON.stringify(value);
  if (/api[_ -]?key|sk-[a-z0-9]/i.test(raw)) throw new Error("备份中疑似包含 API Key，拒绝恢复");
}
