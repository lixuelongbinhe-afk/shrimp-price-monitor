import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CollectionLogEntry, RegionCode, SourceRecord, UserSettings, ValidatedQuote } from "../domain/models.js";

export const DEFAULT_SETTINGS: UserSettings = {
  ai: { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", timeoutMs: 30_000 },
  dailyLimit: 20,
  collectionTime: "08:00",
  followedRegions: ["zhangzhou", "yuedong", "rudong"],
  followedSpecifications: [30, 40, 50, 60, 70, 80],
  aiEnabled: false,
  onboardingComplete: false
};

export class AppDatabase {
  readonly db: DatabaseSync;

  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
    this.migrate();
  }

  close(): void { this.db.close(); }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
        original_publisher TEXT, title TEXT NOT NULL, published_at TEXT NOT NULL,
        collected_at TEXT NOT NULL, content_hash TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        trusted INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(content_hash);
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL REFERENCES sources(id),
        species TEXT NOT NULL, region_code TEXT NOT NULL, county TEXT, granularity TEXT NOT NULL,
        quoted_at TEXT NOT NULL, specification REAL NOT NULL, specification_unit TEXT NOT NULL,
        price REAL NOT NULL, price_unit TEXT NOT NULL, price_type TEXT NOT NULL, evidence TEXT NOT NULL,
        status TEXT NOT NULL, exclusion_reason TEXT, included_in_average INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_quotes_series ON quotes(quoted_at, region_code, county, specification, status);
      CREATE TABLE IF NOT EXISTS collection_runs (
        id TEXT PRIMARY KEY, run_date TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL,
        analyzed INTEGER NOT NULL DEFAULT 0, accepted INTEGER NOT NULL DEFAULT 0,
        rejected INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT, error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runs_date ON collection_runs(run_date, kind);
      CREATE TABLE IF NOT EXISTS collection_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, level TEXT NOT NULL, stage TEXT NOT NULL,
        message TEXT NOT NULL, url TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_cache (
        url TEXT PRIMARY KEY, content_hash TEXT NOT NULL, relevant_text TEXT NOT NULL,
        media_type TEXT NOT NULL, analyzed_at TEXT NOT NULL, result_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fixed_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, search_url TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1, builtin INTEGER NOT NULL DEFAULT 0, trusted INTEGER NOT NULL DEFAULT 1
      );
    `);
    this.db.prepare("INSERT OR IGNORE INTO app_meta(key,value) VALUES('schema_version','1')").run();
    if (!this.db.prepare("SELECT 1 FROM settings WHERE key='user'").get()) this.saveSettings(DEFAULT_SETTINGS);
    const insert = this.db.prepare("INSERT OR IGNORE INTO fixed_sources(name,search_url,enabled,builtin,trusted) VALUES(?,?,1,1,1)");
    insert.run("中国水产养殖网", "https://www.shuichan.cc");
    insert.run("农财宝典水产版", "https://www.nfncb.cn");
    insert.run("海大农牧", "https://www.haid.com.cn");
  }

  getSettings(): UserSettings {
    const row = this.db.prepare("SELECT value_json FROM settings WHERE key='user'").get() as { value_json: string };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(row.value_json) } as UserSettings;
  }

  saveSettings(settings: UserSettings): void {
    if (settings.dailyLimit < 1 || settings.dailyLimit > 20) throw new Error("每日网页分析上限必须在 1 到 20 之间");
    this.db.prepare("INSERT INTO settings(key,value_json) VALUES('user',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify(settings));
  }

  insertQuote(quote: ValidatedQuote): number {
    const insertSource = this.db.prepare(`INSERT INTO sources(name,url,original_publisher,title,published_at,collected_at,content_hash,enabled,trusted)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const sourceResult = insertSource.run(quote.source.name, quote.source.url, quote.source.originalPublisher ?? null, quote.source.title,
      quote.source.publishedAt, quote.source.collectedAt, quote.source.contentHash, quote.source.enabled === false ? 0 : 1, quote.source.trusted ? 1 : 0);
    const result = this.db.prepare(`INSERT INTO quotes(source_id,species,region_code,county,granularity,quoted_at,specification,specification_unit,
      price,price_unit,price_type,evidence,status,exclusion_reason,included_in_average) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      sourceResult.lastInsertRowid, quote.species, quote.regionCode, quote.county, quote.granularity, quote.quotedAt, quote.specification,
      quote.specificationUnit, quote.price, quote.priceUnit, quote.priceType, quote.evidence, quote.status, quote.exclusionReason,
      quote.includedInAverage ? 1 : 0
    );
    return Number(result.lastInsertRowid);
  }

  updateQuoteStatus(id: number, status: ValidatedQuote["status"], included: boolean, reason: string | null): void {
    this.db.prepare("UPDATE quotes SET status=?, included_in_average=?, exclusion_reason=? WHERE id=?").run(status, included ? 1 : 0, reason, id);
  }

  listQuotes(filters: { from?: string; to?: string; regionCode?: RegionCode; specification?: number; includeRejected?: boolean } = {}): ValidatedQuote[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filters.from) { where.push("q.quoted_at>=?"); params.push(filters.from); }
    if (filters.to) { where.push("q.quoted_at<=?"); params.push(filters.to); }
    if (filters.regionCode) { where.push("q.region_code=?"); params.push(filters.regionCode); }
    if (filters.specification) { where.push("q.specification=?"); params.push(filters.specification); }
    if (!filters.includeRejected) where.push("q.status IN ('accepted','anomaly')");
    const sql = `SELECT q.*,s.id source_id,s.name source_name,s.url source_url,s.original_publisher,s.title source_title,
      s.published_at source_published_at,s.collected_at source_collected_at,s.content_hash,s.enabled,s.trusted
      FROM quotes q JOIN sources s ON s.id=q.source_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY q.quoted_at,q.id`;
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(mapQuote);
  }

  log(entry: CollectionLogEntry): void {
    this.db.prepare("INSERT INTO collection_logs(run_id,level,stage,message,url,created_at) VALUES(?,?,?,?,?,?)").run(
      entry.runId ?? null, entry.level, entry.stage, entry.message, entry.url ?? null, entry.createdAt ?? new Date().toISOString()
    );
  }

  listLogs(limit = 500): CollectionLogEntry[] {
    return (this.db.prepare("SELECT run_id,level,stage,message,url,created_at FROM collection_logs ORDER BY id DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((row) => ({
      ...(row.run_id ? { runId: String(row.run_id) } : {}), level: row.level as CollectionLogEntry["level"], stage: String(row.stage),
      message: String(row.message), ...(row.url ? { url: String(row.url) } : {}), createdAt: String(row.created_at)
    }));
  }

  getCached(url: string, contentHash: string): unknown | null {
    const row = this.db.prepare("SELECT result_json FROM document_cache WHERE url=? AND content_hash=?").get(url, contentHash) as { result_json: string } | undefined;
    return row ? JSON.parse(row.result_json) : null;
  }

  saveCache(url: string, contentHash: string, relevantText: string, mediaType: string, result: unknown): void {
    this.db.prepare(`INSERT INTO document_cache(url,content_hash,relevant_text,media_type,analyzed_at,result_json) VALUES(?,?,?,?,?,?)
      ON CONFLICT(url) DO UPDATE SET content_hash=excluded.content_hash,relevant_text=excluded.relevant_text,media_type=excluded.media_type,
      analyzed_at=excluded.analyzed_at,result_json=excluded.result_json`).run(url, contentHash, relevantText, mediaType, new Date().toISOString(), JSON.stringify(result));
  }

  hasCompletedRun(date: string, kind = "daily"): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM collection_runs WHERE run_date=? AND kind=? AND state='completed'").get(date, kind));
  }

  startRun(id: string, date: string, kind: string): void {
    this.db.prepare("INSERT INTO collection_runs(id,run_date,kind,state,started_at) VALUES(?,?,?,'searching',?)").run(id, date, kind, new Date().toISOString());
  }

  updateRun(id: string, state: string, analyzed: number, accepted: number, rejected: number, error?: string): void {
    this.db.prepare("UPDATE collection_runs SET state=?,analyzed=?,accepted=?,rejected=?,error=?,finished_at=CASE WHEN ? IN ('completed','cancelled','failed') THEN ? ELSE NULL END WHERE id=?")
      .run(state, analyzed, accepted, rejected, error ?? null, state, new Date().toISOString(), id);
  }

  listFixedSources(): Array<{ id: number; name: string; searchUrl: string; enabled: boolean; builtin: boolean; trusted: boolean }> {
    return (this.db.prepare("SELECT * FROM fixed_sources ORDER BY id").all() as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id), name: String(row.name), searchUrl: String(row.search_url), enabled: Boolean(row.enabled), builtin: Boolean(row.builtin), trusted: Boolean(row.trusted)
    }));
  }

  addFixedSource(name: string, searchUrl: string): number {
    const url = new URL(searchUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error("固定来源只允许 HTTP 或 HTTPS 地址");
    const result = this.db.prepare("INSERT INTO fixed_sources(name,search_url,enabled,builtin,trusted) VALUES(?,?,1,0,0)").run(name.trim(), url.href);
    return Number(result.lastInsertRowid);
  }

  setFixedSourceEnabled(id: number, enabled: boolean): void {
    const result = this.db.prepare("UPDATE fixed_sources SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
    if (result.changes === 0) throw new Error("固定来源不存在");
  }

  restoreBuiltinSources(): void {
    this.db.prepare("UPDATE fixed_sources SET enabled=1 WHERE builtin=1").run();
  }
}

function mapQuote(row: Record<string, unknown>): ValidatedQuote {
  const source: SourceRecord = {
    id: Number(row.source_id), name: String(row.source_name), url: String(row.source_url), title: String(row.source_title),
    publishedAt: String(row.source_published_at), collectedAt: String(row.source_collected_at), contentHash: String(row.content_hash),
    enabled: Boolean(row.enabled), trusted: Boolean(row.trusted),
    ...(row.original_publisher ? { originalPublisher: String(row.original_publisher) } : {})
  };
  return {
    id: Number(row.id), species: "南美白对虾", regionCode: row.region_code as RegionCode, county: row.county ? String(row.county) : null,
    granularity: row.granularity as ValidatedQuote["granularity"], quotedAt: String(row.quoted_at), specification: Number(row.specification),
    specificationUnit: "尾/斤", price: Number(row.price), priceUnit: "元/斤", priceType: row.price_type as ValidatedQuote["priceType"],
    evidence: String(row.evidence), source, status: row.status as ValidatedQuote["status"], exclusionReason: row.exclusion_reason ? String(row.exclusion_reason) : null,
    includedInAverage: Boolean(row.included_in_average)
  };
}
