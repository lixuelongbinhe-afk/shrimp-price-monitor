import type { AiProvider, CredentialStore, OcrProvider, PdfProvider, SearchProvider } from "../src/domain/providers.js";
import type { AiConnectionConfig, AiExtractionRequest, ExtractedQuote, SearchQuery, SearchResult } from "../src/domain/models.js";

export class MemoryCredentials implements CredentialStore {
  constructor(private value: string | null = "test-key-not-real") {}
  async get(): Promise<string | null> { return this.value; }
  async set(secret: string): Promise<void> { this.value = secret; }
  async delete(): Promise<void> { this.value = null; }
}

export class MockAi implements AiProvider {
  readonly id = "mock"; calls = 0; failures = 0;
  constructor(public quotes: ExtractedQuote[]) {}
  async testConnection(_config: AiConnectionConfig, apiKey: string) { return apiKey ? { status: "success" as const, message: "连接成功" } : { status: "invalid_key" as const, message: "无 Key" }; }
  async extractQuotes(_request: AiExtractionRequest): Promise<ExtractedQuote[]> { this.calls += 1; if (this.failures-- > 0) throw new Error("模拟 AI 临时失败"); return this.quotes; }
}

export class MockSearch implements SearchProvider {
  readonly id = "mock";
  constructor(private results: SearchResult[]) {}
  async search(_query: SearchQuery): Promise<SearchResult[]> { return this.results; }
}

export class MockOcr implements OcrProvider { async recognize(): Promise<string> { return "2026-08-12 如东县 南美白对虾 40尾/斤 塘口价 22元/斤"; } }
export class MockPdf implements PdfProvider { async extract(_pdf: Uint8Array, ocr: OcrProvider): Promise<string> { return ocr.recognize(new Uint8Array()); } }

type ExtractedOverrides = Partial<Omit<ExtractedQuote, "countyText">> & { countyText?: string | undefined };
export function extracted(overrides: ExtractedOverrides = {}): ExtractedQuote {
  const { countyText, ...rest } = overrides;
  const includeCounty = !Object.hasOwn(overrides, "countyText") || countyText !== undefined;
  const result: ExtractedQuote = { species: "南美白对虾", regionText: "江苏南通如东县", ...(includeCounty ? { countyText: countyText ?? "如东县" } : {}), granularity: "county", quotedAt: "2026-08-12",
    specificationValue: 40, specificationUnit: "尾/斤", priceValue: 22, priceUnit: "元/斤", priceType: "塘口价",
    evidence: "8月12日如东县南美白对虾40尾/斤塘口价22元/斤", ...rest };
  return result;
}
