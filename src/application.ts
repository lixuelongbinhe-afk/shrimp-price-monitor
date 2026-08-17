import type { AiProvider, Clock, CredentialStore, OcrProvider, PdfProvider, SearchProvider } from "./domain/providers.js";
import type { RegionCode, UserSettings } from "./domain/models.js";
import { AppDatabase } from "./infrastructure/database.js";
import { WindowsCredentialStore } from "./infrastructure/windows-credential-store.js";
import { DeepSeekProvider } from "./providers/deepseek.js";
import { BasicWebSearchProvider } from "./providers/basic-search.js";
import { DocumentProcessor, PdfJsProvider, TesseractOcrProvider } from "./providers/document-processor.js";
import { CollectionService } from "./services/collection-service.js";
import { StatisticsService } from "./services/statistics-service.js";
import { SettingsService } from "./services/settings-service.js";
import { CollectionScheduler } from "./services/scheduler.js";
import { BackupService } from "./services/backup-service.js";
import { ExportService, type ExportFilters } from "./services/export-service.js";

export interface ApplicationOverrides { ai?: AiProvider; search?: SearchProvider; ocr?: OcrProvider; pdf?: PdfProvider; credentials?: CredentialStore; clock?: Clock; }

export class ShrimpMonitorBackend {
  readonly database: AppDatabase;
  readonly settings: SettingsService;
  readonly collection: CollectionService;
  readonly statistics: StatisticsService;
  readonly backup: BackupService;
  readonly export: ExportService;
  readonly scheduler: CollectionScheduler;

  constructor(databasePath: string, overrides: ApplicationOverrides = {}) {
    this.database = new AppDatabase(databasePath);
    const ai = overrides.ai ?? new DeepSeekProvider(); const search = overrides.search ?? new BasicWebSearchProvider();
    const credentials = overrides.credentials ?? new WindowsCredentialStore(); const ocr = overrides.ocr ?? new TesseractOcrProvider(); const pdf = overrides.pdf ?? new PdfJsProvider();
    this.settings = new SettingsService(this.database, ai, credentials);
    this.collection = new CollectionService(this.database, ai, search, new DocumentProcessor(ocr, pdf), credentials, overrides.clock);
    this.statistics = new StatisticsService(this.database); this.backup = new BackupService(this.database, credentials); this.export = new ExportService(this.database, this.statistics);
    this.scheduler = new CollectionScheduler(this.database, this.collection, overrides.clock);
  }

  async invoke(method: string, payload: unknown = {}): Promise<unknown> {
    const input = payload as Record<string, unknown>;
    switch (method) {
      case "settings.get": return this.settings.getAsync();
      case "settings.test": return this.settings.test(input.config as UserSettings["ai"], input.apiKey as string | undefined);
      case "settings.save": return this.settings.save(input.settings as UserSettings, input.apiKey as string | undefined);
      case "settings.deleteApiKey": return this.settings.deleteApiKey();
      case "collection.run": return this.collection.run((input.kind as "daily" | "history") ?? "daily");
      case "collection.cancel": return this.collection.cancel();
      case "collection.progress": return this.collection.getProgress();
      case "quotes.list": return this.database.listQuotes(input as { from?: string; to?: string; regionCode?: RegionCode; specification?: number; includeRejected?: boolean });
      case "logs.list": return this.database.listLogs(Number(input.limit ?? 500));
      case "sources.fixed.list": return this.database.listFixedSources();
      case "sources.fixed.add": return this.database.addFixedSource(String(input.name), String(input.searchUrl));
      case "sources.fixed.setEnabled": return this.database.setFixedSourceEnabled(Number(input.id), Boolean(input.enabled));
      case "sources.fixed.restoreBuiltin": return this.database.restoreBuiltinSources();
      case "statistics.county": return this.statistics.countySeries(input as ExportFilters);
      case "statistics.region": return this.statistics.regionSeries(input as ExportFilters);
      case "statistics.dashboard": return this.statistics.dashboard(String(input.date), input.regionCode as RegionCode, Number(input.specification), input.county ? String(input.county) : null);
      case "export.excel": return this.export.excel(input as ExportFilters);
      case "backup.create": return this.backup.create();
      case "backup.restore": return this.backup.restore(input.bytes as Uint8Array);
      default: throw new Error(`未知后端方法：${method}`);
    }
  }

  start(): void { this.scheduler.start(); }
  close(): void { this.scheduler.stop(); this.collection.cancel(); this.database.close(); }
}
