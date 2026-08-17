import type { DailyAverage, DashboardMetric, RegionAverage, RegionCode } from "../domain/models.js";
import { AppDatabase } from "../infrastructure/database.js";
import { countyDailyAverages, historyPosition, isStale, regionDailyAverages, weekOverWeek, yearOverYear } from "../core/statistics.js";

export class StatisticsService {
  constructor(private readonly database: AppDatabase) {}

  countySeries(filters: { from?: string; to?: string; regionCode?: RegionCode; specification?: number } = {}): DailyAverage[] {
    return countyDailyAverages(this.database.listQuotes(filters));
  }

  regionSeries(filters: { from?: string; to?: string; regionCode?: RegionCode; specification?: number } = {}): RegionAverage[] {
    return regionDailyAverages(this.countySeries(filters));
  }

  dashboard(date: string, regionCode: RegionCode, specification: number, county: string | null = null): DashboardMetric {
    const all = county ? this.countySeries({ regionCode, specification }) : this.regionSeries({ regionCode, specification });
    const current = all.find((item) => item.date === date && item.county === county) ?? null;
    const latestDate = all.filter((item) => item.date <= date).at(-1)?.date ?? null;
    return { current, yearOverYear: yearOverYear(current, all), weekOverWeek: weekOverWeek(date, all), historyPosition: historyPosition(current, all), latestDate, stale: isStale(latestDate, date) };
  }
}
