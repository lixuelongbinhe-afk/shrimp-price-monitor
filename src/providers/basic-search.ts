import * as cheerio from "cheerio";
import type { SearchProvider } from "../domain/providers.js";
import type { SearchQuery, SearchResult } from "../domain/models.js";
import { REGIONS } from "../domain/regions.js";

export class BasicWebSearchProvider implements SearchProvider {
  readonly id = "basic-web-search";
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResult[]> {
    const words = [query.county ?? REGIONS[query.regionCode].name, "南美白对虾", query.specification ? `${query.specification}尾/斤` : "", "塘口价 塘头价 收购价", query.date].filter(Boolean).join(" ");
    const endpoint = new URL("https://html.duckduckgo.com/html/");
    endpoint.searchParams.set("q", words);
    const response = await this.fetchImpl(endpoint, { ...(signal ? { signal } : {}), headers: { "user-agent": "ShrimpPriceMonitor/0.1 (local desktop application)" } });
    if (!response.ok) throw new Error(`基础网页搜索失败（HTTP ${response.status}）`);
    const $ = cheerio.load(await response.text());
    const output: SearchResult[] = [];
    $(".result").each((_index, element) => {
      const link = $(element).find(".result__a").first();
      const rawUrl = link.attr("href");
      if (!rawUrl) return;
      const url = decodeResultUrl(rawUrl);
      output.push({ title: link.text().trim(), url, snippet: $(element).find(".result__snippet").text().trim(), sourceName: hostname(url), trusted: false });
    });
    return output.slice(0, 20);
  }
}

function decodeResultUrl(raw: string): string {
  try { const value = new URL(raw, "https://duckduckgo.com"); return value.searchParams.get("uddg") ?? value.href; } catch { return raw; }
}
function hostname(url: string): string { try { return new URL(url).hostname; } catch { return "未知来源"; } }
