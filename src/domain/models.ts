export const REGION_CODES = ["zhangzhou", "yuedong", "rudong"] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const PRICE_TYPES = ["pond_gate", "pond_head", "purchase"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export type QuoteGranularity = "county" | "region";
export type QuoteStatus = "accepted" | "rejected" | "duplicate" | "anomaly" | "ai_failed";

export interface SourceRecord {
  id?: number;
  name: string;
  url: string;
  originalPublisher?: string;
  title: string;
  publishedAt: string;
  collectedAt: string;
  contentHash: string;
  enabled?: boolean;
  trusted?: boolean;
}

export interface ExtractedQuote {
  species: string;
  regionText: string;
  countyText?: string;
  granularity: QuoteGranularity;
  quotedAt: string;
  specificationValue: number;
  specificationUnit: string;
  priceValue: number;
  priceUnit: string;
  priceType: PriceType | string;
  evidence: string;
}

export interface ValidatedQuote {
  id?: number;
  species: "南美白对虾";
  regionCode: RegionCode;
  county: string | null;
  granularity: QuoteGranularity;
  quotedAt: string;
  specification: number;
  specificationUnit: "尾/斤";
  price: number;
  priceUnit: "元/斤";
  priceType: PriceType;
  evidence: string;
  source: SourceRecord;
  status: QuoteStatus;
  exclusionReason: string | null;
  includedInAverage: boolean;
}

export interface ValidationResult {
  ok: boolean;
  quote?: ValidatedQuote;
  reasons: string[];
}

export interface SearchQuery {
  regionCode: RegionCode;
  county?: string;
  specification?: number;
  date: string;
  historical?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedAt?: string;
  trusted: boolean;
}

export interface RelevantDocument {
  url: string;
  title: string;
  sourceName: string;
  publishedAt?: string;
  mediaType: "html" | "image" | "pdf";
  relevantText: string;
  contentHash: string;
}

export interface AiExtractionRequest {
  document: RelevantDocument;
  regionHint: RegionCode;
}

export interface AiConnectionConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export type AiConnectionStatus =
  | "success"
  | "invalid_key"
  | "invalid_url"
  | "model_unavailable"
  | "network_error"
  | "quota_exceeded";

export interface AiConnectionResult {
  status: AiConnectionStatus;
  message: string;
}

export interface UserSettings {
  ai: AiConnectionConfig;
  dailyLimit: number;
  collectionTime: string;
  followedRegions: RegionCode[];
  followedSpecifications: number[];
  aiEnabled: boolean;
  onboardingComplete: boolean;
}

export interface CollectionProgress {
  runId: string;
  state: "idle" | "searching" | "fetching" | "analyzing" | "completed" | "cancelled" | "failed";
  analyzed: number;
  limit: number;
  accepted: number;
  rejected: number;
  message: string;
}

export interface DailyAverage {
  date: string;
  regionCode: RegionCode;
  county: string | null;
  specification: number;
  price: number;
  sourceCount: number;
  singleSource: boolean;
}

export interface RegionAverage extends DailyAverage {
  countyCoverage: number;
}

export interface TrendComparison {
  value: number | null;
  percent: number | null;
  label: string;
}

export interface DashboardMetric {
  current: DailyAverage | RegionAverage | null;
  yearOverYear: TrendComparison;
  weekOverWeek: TrendComparison & { currentPeriod: string; previousPeriod: string };
  historyPosition: "high" | "middle" | "low" | "insufficient";
  latestDate: string | null;
  stale: boolean;
}

export interface CollectionLogEntry {
  runId?: string;
  level: "info" | "warning" | "error";
  stage: string;
  message: string;
  url?: string;
  createdAt?: string;
}
