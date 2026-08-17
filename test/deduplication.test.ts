import { describe, expect, it } from "vitest";
import { isDuplicate } from "../src/core/deduplication.js";
import type { ValidatedQuote } from "../src/domain/models.js";

const base: ValidatedQuote = { species: "南美白对虾", regionCode: "rudong", county: "如东县", granularity: "county", quotedAt: "2026-08-12", specification: 40,
  specificationUnit: "尾/斤", price: 22, priceUnit: "元/斤", priceType: "pond_gate", evidence: "如东南美白对虾40尾塘口价22元", status: "accepted", exclusionReason: null, includedInAverage: true,
  source: { name: "A", url: "https://a.test/page?utm_source=x", originalPublisher: "原作者", title: "8月12日对虾报价", publishedAt: "2026-08-12", collectedAt: "2026-08-12T00:00:00Z", contentHash: "one" } };

describe("跨站去重", () => {
  it("内容哈希相同即重复", () => expect(isDuplicate({ ...base, source: { ...base.source, url: "https://b.test", contentHash: "one" } }, [base])).toBe(true));
  it("同原作者且标题证据相似即重复", () => expect(isDuplicate({ ...base, source: { ...base.source, url: "https://b.test", contentHash: "two" } }, [base])).toBe(true));
  it("独立来源不重复", () => expect(isDuplicate({ ...base, source: { ...base.source, url: "https://b.test", contentHash: "two", originalPublisher: "另一作者", title: "独立调查" } }, [base])).toBe(false));
});
