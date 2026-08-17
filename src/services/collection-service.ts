import { randomUUID } from "node:crypto";
import type { AiProvider, Clock, CredentialStore, SearchProvider } from "../domain/providers.js";
import type { CollectionProgress, RegionCode, SearchResult, SourceRecord, ValidatedQuote } from "../domain/models.js";
import { systemClock } from "../domain/providers.js";
import { AppDatabase } from "../infrastructure/database.js";
import { DocumentProcessor } from "../providers/document-processor.js";
import { allocationFor, excludeAnomalies } from "../core/statistics.js";
import { validateQuote } from "../core/validation.js";
import { detectPromptInjection } from "../core/security.js";
import { isDuplicate } from "../core/deduplication.js";
import { AiProviderError } from "../providers/deepseek.js";

export class CollectionService extends EventTarget {
  private current: { controller: AbortController; progress: CollectionProgress } | null = null;

  constructor(
    private readonly database: AppDatabase,
    private readonly ai: AiProvider,
    private readonly search: SearchProvider,
    private readonly processor: DocumentProcessor,
    private readonly credentials: CredentialStore,
    private readonly clock: Clock = systemClock
  ) { super(); }

  getProgress(): CollectionProgress {
    return this.current?.progress ?? { runId: "", state: "idle", analyzed: 0, limit: this.database.getSettings().dailyLimit, accepted: 0, rejected: 0, message: "空闲" };
  }

  cancel(): boolean {
    if (!this.current) return false;
    this.current.controller.abort();
    return true;
  }

  async run(kind: "daily" | "history" = "daily"): Promise<CollectionProgress> {
    if (this.current) throw new Error("已有采集任务正在运行");
    const settings = this.database.getSettings();
    if (!settings.aiEnabled) throw new Error("DeepSeek 尚未通过连接测试，不能启动采集");
    const apiKey = await this.credentials.get();
    if (!apiKey) throw new Error("尚未保存 DeepSeek API Key");
    const runDate = this.clock.now().toISOString().slice(0, 10);
    const runId = randomUUID();
    const controller = new AbortController();
    const progress: CollectionProgress = { runId, state: "searching", analyzed: 0, limit: settings.dailyLimit, accepted: 0, rejected: 0, message: "正在搜索候选网页" };
    this.current = { controller, progress };
    this.database.startRun(runId, runDate, kind);
    this.emit(progress);
    try {
      const candidates = await this.searchCandidates(runDate, settings.followedRegions, settings.followedSpecifications, allocationFor(settings.dailyLimit), controller.signal, kind === "history");
      for (const candidate of candidates) {
        if (progress.analyzed >= progress.limit) break;
        controller.signal.throwIfAborted();
        await this.processCandidate(candidate.regionCode, candidate.result, apiKey, progress, controller.signal);
      }
      this.applyAnomalyRules();
      progress.state = "completed"; progress.message = `采集完成，采用 ${progress.accepted} 条，弃用 ${progress.rejected} 条`;
      this.database.updateRun(runId, progress.state, progress.analyzed, progress.accepted, progress.rejected);
      return { ...progress };
    } catch (error) {
      if (controller.signal.aborted) {
        progress.state = "cancelled"; progress.message = "采集已取消，已校验成功的数据已保留";
      } else {
        progress.state = "failed"; progress.message = error instanceof Error ? error.message : String(error);
        this.database.log({ runId, level: "error", stage: "collection", message: progress.message });
      }
      this.database.updateRun(runId, progress.state, progress.analyzed, progress.accepted, progress.rejected, progress.message);
      return { ...progress };
    } finally {
      this.emit(progress);
      this.current = null;
    }
  }

  private async searchCandidates(date: string, regions: RegionCode[], specs: number[], allocation: Record<RegionCode, number>, signal: AbortSignal, historical: boolean): Promise<Array<{ regionCode: RegionCode; result: SearchResult }>> {
    const output: Array<{ regionCode: RegionCode; result: SearchResult }> = [];
    const overflow: Array<{ regionCode: RegionCode; result: SearchResult }> = [];
    const seen = new Set<string>();
    const enabledSources = this.database.listFixedSources().filter((source) => source.enabled);
    for (const regionCode of regions) {
      const regionResults: SearchResult[] = [];
      for (const specification of specs) {
        try {
          const found = await this.search.search({ regionCode, specification, date, historical }, signal);
          regionResults.push(...found);
        } catch (error) {
          this.database.log({ ...(this.current?.progress.runId ? { runId: this.current.progress.runId } : {}), level: "warning", stage: "search", message: `搜索失败：${error instanceof Error ? error.message : String(error)}` });
        }
      }
      for (const item of regionResults) if (enabledSources.some((source) => sameHostname(source.searchUrl, item.url))) item.trusted = true;
      regionResults.sort((a, b) => Number(b.trusted) - Number(a.trusted) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
      for (const result of regionResults) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        if (output.filter((item) => item.regionCode === regionCode).length < allocation[regionCode]) output.push({ regionCode, result });
        else overflow.push({ regionCode, result });
      }
    }
    for (const item of overflow) { if (output.length >= this.database.getSettings().dailyLimit) break; output.push(item); }
    return output;
  }

  private async processCandidate(regionCode: RegionCode, result: SearchResult, apiKey: string, progress: CollectionProgress, signal: AbortSignal): Promise<void> {
    progress.state = "fetching"; progress.message = `正在获取：${result.title}`; this.emit(progress);
    let document;
    try { document = await this.processor.process(result, signal); }
    catch (error) { progress.rejected += 1; this.database.log({ runId: progress.runId, level: "warning", stage: "fetch", message: errorMessage(error), url: result.url }); return; }
    const injection = detectPromptInjection(document.relevantText);
    if (injection) { progress.rejected += 1; this.database.log({ runId: progress.runId, level: "warning", stage: "security", message: injection, url: result.url }); return; }

    let extracted = this.database.getCached(result.url, document.contentHash) as Awaited<ReturnType<AiProvider["extractQuotes"]>> | null;
    if (!extracted) {
      progress.state = "analyzing"; progress.message = `正在分析 ${progress.analyzed + 1}/${progress.limit}`; this.emit(progress);
      progress.analyzed += 1;
      try {
        extracted = await retryOnce(() => this.ai.extractQuotes({ document, regionHint: regionCode }, this.database.getSettings().ai, apiKey, signal));
        this.database.saveCache(result.url, document.contentHash, document.relevantText, document.mediaType, extracted);
      } catch (error) {
        progress.rejected += 1;
        this.database.log({ runId: progress.runId, level: "error", stage: "ai", message: `AI分析失败：${errorMessage(error)}`, url: result.url });
        if (error instanceof AiProviderError && ["invalid_key", "quota_exceeded", "model_unavailable"].includes(error.status)) throw error;
        return;
      }
    }
    const existing = this.database.listQuotes({ includeRejected: true });
    for (const item of extracted) {
      const source: SourceRecord = { name: result.sourceName, url: result.url, title: result.title, publishedAt: result.publishedAt ?? item.quotedAt,
        collectedAt: this.clock.now().toISOString(), contentHash: document.contentHash, trusted: result.trusted };
      const validation = validateQuote(item, source);
      if (!validation.ok || !validation.quote) { progress.rejected += 1; this.database.log({ runId: progress.runId, level: "warning", stage: "validation", message: validation.reasons.join("；"), url: result.url }); continue; }
      const quote = validation.quote;
      if (isDuplicate(quote, existing)) { progress.rejected += 1; this.database.log({ runId: progress.runId, level: "info", stage: "deduplication", message: "重复转载，未计入统计", url: result.url }); continue; }
      this.database.insertQuote(quote); existing.push(quote); progress.accepted += 1;
    }
  }

  private applyAnomalyRules(): void {
    const updated = excludeAnomalies(this.database.listQuotes());
    for (const quote of updated) if (quote.id && quote.status === "anomaly") this.database.updateQuoteStatus(quote.id, quote.status, false, quote.exclusionReason);
  }

  private emit(progress: CollectionProgress): void { this.dispatchEvent(new CustomEvent("progress", { detail: { ...progress } })); }
}

async function retryOnce<T>(operation: () => Promise<T>): Promise<T> { try { return await operation(); } catch { return operation(); } }
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
function sameHostname(left: string, right: string): boolean { try { return new URL(left).hostname.replace(/^www\./, "") === new URL(right).hostname.replace(/^www\./, ""); } catch { return false; } }
