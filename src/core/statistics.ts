import type { DailyAverage, DashboardMetric, RegionAverage, RegionCode, TrendComparison, ValidatedQuote } from "../domain/models.js";

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export function excludeAnomalies(quotes: readonly ValidatedQuote[]): ValidatedQuote[] {
  const grouped = Map.groupBy(quotes, (quote) => `${quote.quotedAt}|${quote.regionCode}|${quote.county}|${quote.specification}`);
  const result: ValidatedQuote[] = [];
  for (const group of grouped.values()) {
    const uniqueSources = new Set(group.map((quote) => quote.source.contentHash));
    if (uniqueSources.size < 3) {
      result.push(...group);
      continue;
    }
    const medianValue = median(group.map((quote) => quote.price));
    result.push(...group.map((quote) => {
      if (Math.abs(quote.price - medianValue) / medianValue <= 0.2) return quote;
      return { ...quote, status: "anomaly" as const, includedInAverage: false, exclusionReason: `偏离中位数 ${round2(Math.abs(quote.price - medianValue) / medianValue * 100)}%` };
    }));
  }
  return result;
}

export function countyDailyAverages(quotes: readonly ValidatedQuote[]): DailyAverage[] {
  const eligible = quotes.filter((quote) => quote.status === "accepted" && quote.includedInAverage && quote.county !== null);
  const grouped = Map.groupBy(eligible, (quote) => `${quote.quotedAt}|${quote.regionCode}|${quote.county}|${quote.specification}`);
  return [...grouped.values()].map((group) => ({
    date: group[0]!.quotedAt,
    regionCode: group[0]!.regionCode,
    county: group[0]!.county,
    specification: group[0]!.specification,
    price: round2(group.reduce((sum, quote) => sum + quote.price, 0) / group.length),
    sourceCount: new Set(group.map((quote) => quote.source.contentHash)).size,
    singleSource: new Set(group.map((quote) => quote.source.contentHash)).size === 1
  })).sort(sortAverage);
}

export function regionDailyAverages(countyAverages: readonly DailyAverage[]): RegionAverage[] {
  const grouped = Map.groupBy(countyAverages, (item) => `${item.date}|${item.regionCode}|${item.specification}`);
  return [...grouped.values()].map((group) => ({
    date: group[0]!.date,
    regionCode: group[0]!.regionCode,
    county: null,
    specification: group[0]!.specification,
    price: round2(group.reduce((sum, item) => sum + item.price, 0) / group.length),
    sourceCount: group.reduce((sum, item) => sum + item.sourceCount, 0),
    singleSource: group.length === 1 && group[0]!.singleSource,
    countyCoverage: new Set(group.map((item) => item.county)).size
  })).sort(sortAverage);
}

export function yearOverYear(current: DailyAverage | null, history: readonly DailyAverage[]): TrendComparison {
  if (!current) return noComparison("暂无同比");
  const target = shiftYears(current.date, -1);
  const previous = history.find((item) => sameSeries(item, current) && item.date === target);
  return previous ? comparison(current.price, previous.price) : noComparison("暂无同比");
}

export function weekOverWeek(date: string, series: readonly DailyAverage[]): TrendComparison & { currentPeriod: string; previousPeriod: string } {
  const currentStart = mondayOf(date);
  const previousStart = addDays(currentStart, -7);
  const currentPeriod = `${currentStart} 至 ${addDays(currentStart, 6)}`;
  const previousPeriod = `${previousStart} 至 ${addDays(previousStart, 6)}`;
  const currentValues = series.filter((item) => item.date >= currentStart && item.date <= addDays(currentStart, 6)).map((item) => item.price);
  const previousValues = series.filter((item) => item.date >= previousStart && item.date <= addDays(previousStart, 6)).map((item) => item.price);
  if (!currentValues.length || !previousValues.length) return { ...noComparison("暂无环比"), currentPeriod, previousPeriod };
  return { ...comparison(average(currentValues), average(previousValues)), currentPeriod, previousPeriod };
}

export function historyPosition(current: DailyAverage | null, history: readonly DailyAverage[]): DashboardMetric["historyPosition"] {
  if (!current) return "insufficient";
  const start = addDays(current.date, -90);
  const values = history.filter((item) => sameSeries(item, current) && item.date >= start && item.date < current.date).map((item) => item.price);
  if (values.length < 30) return "insufficient";
  const rank = values.filter((value) => value <= current.price).length / values.length;
  if (rank >= 0.75) return "high";
  if (rank < 0.25) return "low";
  return "middle";
}

export function isStale(latestDate: string | null, today: string): boolean {
  return latestDate ? differenceInDays(today, latestDate) > 7 : false;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const average = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const noComparison = (label: string): TrendComparison => ({ value: null, percent: null, label });
const comparison = (current: number, previous: number): TrendComparison => ({ value: round2(current - previous), percent: round2((current - previous) / previous * 100), label: "" });
const sameSeries = (left: DailyAverage, right: DailyAverage): boolean => left.regionCode === right.regionCode && left.county === right.county && left.specification === right.specification;
const sortAverage = (left: DailyAverage, right: DailyAverage): number => left.date.localeCompare(right.date) || left.regionCode.localeCompare(right.regionCode) || left.specification - right.specification;

function date(value: string): Date { return new Date(`${value}T00:00:00Z`); }
function iso(value: Date): string { return value.toISOString().slice(0, 10); }
export function addDays(value: string, amount: number): string { const result = date(value); result.setUTCDate(result.getUTCDate() + amount); return iso(result); }
function shiftYears(value: string, amount: number): string { const result = date(value); result.setUTCFullYear(result.getUTCFullYear() + amount); return iso(result); }
function mondayOf(value: string): string { const result = date(value); const day = result.getUTCDay(); result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1)); return iso(result); }
function differenceInDays(left: string, right: string): number { return Math.floor((date(left).getTime() - date(right).getTime()) / 86_400_000); }

export function allocationFor(limit: number): Record<RegionCode, number> {
  const weights: Record<RegionCode, number> = { zhangzhou: 8, yuedong: 7, rudong: 5 };
  const base = { zhangzhou: 0, yuedong: 0, rudong: 0 };
  let assigned = 0;
  for (const code of Object.keys(weights) as RegionCode[]) {
    base[code] = Math.floor(limit * weights[code] / 20);
    assigned += base[code];
  }
  const order: RegionCode[] = ["zhangzhou", "yuedong", "rudong"];
  for (let i = 0; assigned < limit; i += 1, assigned += 1) base[order[i % order.length]!] += 1;
  return base;
}
