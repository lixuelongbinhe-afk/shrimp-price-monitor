import type {
  AiConnectionConfig,
  AiConnectionResult,
  CollectionLogEntry,
  CollectionProgress,
  DailyAverage,
  DashboardMetric,
  RegionAverage,
  RegionCode,
  UserSettings,
  ValidatedQuote
} from "../../src/domain/models";

export interface SettingsSnapshot extends UserSettings {
  hasApiKey: boolean;
}

export interface SeriesFilters {
  from?: string;
  to?: string;
  regionCode?: RegionCode;
  specification?: number;
}

export interface QuoteFilters extends SeriesFilters {
  includeRejected?: boolean;
}

export interface FixedSource {
  id: number;
  name: string;
  searchUrl: string;
  enabled: boolean;
  builtin: boolean;
  trusted: boolean;
}

const invoke = <T>(method: string, payload?: unknown): Promise<T> =>
  window.shrimp.invoke(method, payload) as Promise<T>;

export const backendApi = {
  getSettings: () => invoke<SettingsSnapshot>("settings.get"),
  testSettings: (config: AiConnectionConfig, apiKey?: string) =>
    invoke<AiConnectionResult>("settings.test", apiKey === undefined ? { config } : { config, apiKey }),
  saveSettings: (settings: UserSettings, apiKey?: string) =>
    invoke<AiConnectionResult>("settings.save", apiKey === undefined ? { settings } : { settings, apiKey }),
  deleteApiKey: () => invoke<void>("settings.deleteApiKey"),
  runCollection: (kind: "daily" | "history") => invoke<CollectionProgress>("collection.run", { kind }),
  cancelCollection: () => invoke<void>("collection.cancel"),
  collectionProgress: () => invoke<CollectionProgress>("collection.progress"),
  listQuotes: (filters: QuoteFilters = {}) => invoke<ValidatedQuote[]>("quotes.list", filters),
  listLogs: (limit = 500) => invoke<CollectionLogEntry[]>("logs.list", { limit }),
  listFixedSources: () => invoke<FixedSource[]>("sources.fixed.list"),
  addFixedSource: (name: string, searchUrl: string) => invoke<number>("sources.fixed.add", { name, searchUrl }),
  setFixedSourceEnabled: (id: number, enabled: boolean) => invoke<void>("sources.fixed.setEnabled", { id, enabled }),
  restoreBuiltinSources: () => invoke<void>("sources.fixed.restoreBuiltin"),
  countySeries: (filters: SeriesFilters = {}) => invoke<DailyAverage[]>("statistics.county", filters),
  regionSeries: (filters: SeriesFilters = {}) => invoke<RegionAverage[]>("statistics.region", filters),
  dashboard: (date: string, regionCode: RegionCode, specification: number) =>
    invoke<DashboardMetric>("statistics.dashboard", { date, regionCode, specification }),
  exportExcel: (filters: SeriesFilters = {}) => invoke<Uint8Array>("export.excel", filters),
  backupCreate: () => invoke<Uint8Array>("backup.create"),
  backupRestore: (bytes: Uint8Array) => invoke<void>("backup.restore", { bytes })
};