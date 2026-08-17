import { describe, expect, it } from "vitest";
import { allocationFor, countyDailyAverages, excludeAnomalies, historyPosition, regionDailyAverages, weekOverWeek, yearOverYear } from "../src/core/statistics.js";
import type { DailyAverage, ValidatedQuote } from "../src/domain/models.js";

const quote = (price: number, source: string, county = "如东县", date = "2026-08-12"): ValidatedQuote => ({
  species: "南美白对虾", regionCode: "rudong", county, granularity: "county", quotedAt: date, specification: 40, specificationUnit: "尾/斤",
  price, priceUnit: "元/斤", priceType: "pond_gate", evidence: "如东县塘口价", source: { name: source, url: `https://${source}.test`, title: source, publishedAt: date, collectedAt: `${date}T00:00:00Z`, contentHash: source },
  status: "accepted", exclusionReason: null, includedInAverage: true
});

describe("统计规则", () => {
  it("执行 8/7/5 配额", () => expect(allocationFor(20)).toEqual({ zhangzhou: 8, yuedong: 7, rudong: 5 }));
  it("三源时排除偏离中位数超过20%的异常价", () => {
    const result = excludeAnomalies([quote(20, "a"), quote(21, "b"), quote(40, "c")]);
    expect(result[2]?.status).toBe("anomaly"); expect(result[2]?.includedInAverage).toBe(false);
  });
  it("少于三源时不排除异常", () => expect(excludeAnomalies([quote(20, "a"), quote(40, "b")]).every((q) => q.status === "accepted")).toBe(true));
  it("县区算术平均后再做县区等权区域平均", () => {
    const counties = countyDailyAverages([quote(20, "a"), quote(22, "b"), quote(30, "c", "海丰县")]);
    const region = regionDailyAverages(counties);
    expect(counties[0]?.price).toBe(21); expect(region[0]?.price).toBe(25.5); expect(region[0]?.countyCoverage).toBe(2);
  });
  it("同比严格匹配去年同月同日", () => {
    const current = average("2026-08-12", 22); const history = [average("2025-08-12", 20), average("2025-08-11", 10)];
    expect(yearOverYear(current, history).percent).toBe(10); expect(yearOverYear(average("2026-08-13", 22), history).label).toBe("暂无同比");
  });
  it("自然周环比不跨用相邻日", () => {
    const series = [average("2026-08-03", 20), average("2026-08-09", 22), average("2026-08-10", 24), average("2026-08-12", 26)];
    expect(weekOverWeek("2026-08-12", series).percent).toBeCloseTo(19.05); expect(weekOverWeek("2026-08-02", series).label).toBe("暂无环比");
  });
  it("90天至少30天并按四分位判定", () => {
    const history = Array.from({ length: 30 }, (_, i) => average(`2026-07-${String(i + 1).padStart(2, "0")}`, i + 1));
    expect(historyPosition(average("2026-08-01", 40), history)).toBe("high"); expect(historyPosition(average("2026-08-01", 1), history)).toBe("low");
    expect(historyPosition(average("2026-08-01", 20), history.slice(0, 29))).toBe("insufficient");
  });
});

function average(date: string, price: number): DailyAverage { return { date, regionCode: "rudong", county: null, specification: 40, price, sourceCount: 1, singleSource: true }; }
