import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/infrastructure/database.js";
import { BackupService } from "../src/services/backup-service.js";
import { ExportService } from "../src/services/export-service.js";
import { StatisticsService } from "../src/services/statistics-service.js";
import { validateQuote } from "../src/core/validation.js";
import { extracted } from "./helpers.js";

const databases: AppDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
const makeDb = () => { const db = new AppDatabase(":memory:"); databases.push(db); return db; };

describe("导出与备份", () => {
  it("Excel 包含均价和原始报价工作表", async () => {
    const db = makeDb(); insert(db); const bytes = await new ExportService(db, new StatisticsService(db)).excel();
    expect(bytes.byteLength).toBeGreaterThan(5_000); expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe("PK");
  });
  it("备份恢复数据但禁用 AI，且不含 API Key", async () => {
    const db = makeDb(); insert(db); db.saveSettings({ ...db.getSettings(), aiEnabled: true });
    const service = new BackupService(db); const bytes = service.create(); const text = new TextDecoder().decode(bytes);
    expect(text).not.toMatch(/api[_ -]?key|test-key-not-real|sk-/i);
    const target = makeDb(); await new BackupService(target).restore(bytes); expect(target.listQuotes()).toHaveLength(1); expect(target.getSettings().aiEnabled).toBe(false);
  });
  it("篡改备份后拒绝恢复", async () => {
    const db = makeDb(); const bytes = new BackupService(db).create(); const text = new TextDecoder().decode(bytes).replace("https://www.shuichan.cc", "https://tampered.invalid");
    await expect(new BackupService(makeDb()).restore(new TextEncoder().encode(text))).rejects.toThrow();
  });
});

function insert(db: AppDatabase): void {
  const source = { name: "固定来源", url: "https://fixture.test", title: "报价", publishedAt: "2026-08-12", collectedAt: "2026-08-12T00:00:00Z", contentHash: "hash" };
  const result = validateQuote(extracted(), source); if (!result.quote) throw new Error("fixture invalid"); db.insertQuote(result.quote);
}
