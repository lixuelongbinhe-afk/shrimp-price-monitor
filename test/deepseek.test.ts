import { describe, expect, it } from "vitest";
import { AiProviderError, DeepSeekProvider } from "../src/providers/deepseek.js";

const config = { baseUrl: "https://api.deepseek.test", model: "deepseek-v4-flash", timeoutMs: 1_000 };
const request = { regionHint: "rudong" as const, document: { url: "https://fixture.test", title: "报价", sourceName: "fixture", mediaType: "html" as const, relevantText: "如东塘口价", contentHash: "x" } };

describe("DeepSeek Provider", () => {
  it("区分无效 Key、模型无权限和余额不足", async () => {
    for (const [status, expected] of [[401, "invalid_key"], [404, "model_unavailable"], [429, "quota_exceeded"]] as const) {
      const provider = new DeepSeekProvider(async () => new Response(status === 404 ? "model not found" : "quota", { status }));
      expect((await provider.testConnection(config, "fake-key")).status).toBe(expected);
    }
  });
  it("错误 JSON 被拒绝", async () => {
    const provider = new DeepSeekProvider(async () => new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    await expect(provider.extractQuotes(request, config, "fake-key")).rejects.toBeInstanceOf(AiProviderError);
  });
  it("符合 Schema 的提取结果被接受", async () => {
    const content = JSON.stringify({ quotes: [{ species: "南美白对虾", regionText: "如东", countyText: "如东县", granularity: "county", quotedAt: "2026-08-12", specificationValue: 40, specificationUnit: "尾/斤", priceValue: 22, priceUnit: "元/斤", priceType: "塘口价", evidence: "塘口价22元/斤" }] });
    const provider = new DeepSeekProvider(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await provider.extractQuotes(request, config, "fake-key")).toHaveLength(1);
  });
});
