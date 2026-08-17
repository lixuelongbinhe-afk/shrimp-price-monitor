import type {
  AiConnectionConfig,
  AiConnectionResult,
  AiExtractionRequest,
  ExtractedQuote,
  SearchQuery,
  SearchResult
} from "./models.js";

export interface AiProvider {
  readonly id: string;
  testConnection(config: AiConnectionConfig, apiKey: string, signal?: AbortSignal): Promise<AiConnectionResult>;
  extractQuotes(request: AiExtractionRequest, config: AiConnectionConfig, apiKey: string, signal?: AbortSignal): Promise<ExtractedQuote[]>;
}

export interface SearchProvider {
  readonly id: string;
  search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult[]>;
}

export interface OcrProvider {
  recognize(image: Uint8Array, signal?: AbortSignal): Promise<string>;
}

export interface PdfProvider {
  extract(pdf: Uint8Array, ocr: OcrProvider, signal?: AbortSignal): Promise<string>;
}

export interface CredentialStore {
  get(): Promise<string | null>;
  set(secret: string): Promise<void>;
  delete(): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
