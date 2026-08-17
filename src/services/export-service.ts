import ExcelJS from "exceljs";
import type { RegionCode } from "../domain/models.js";
import { AppDatabase } from "../infrastructure/database.js";
import { StatisticsService } from "./statistics-service.js";

export interface ExportFilters { from?: string; to?: string; regionCode?: RegionCode; specification?: number; }

export class ExportService {
  constructor(private readonly database: AppDatabase, private readonly statistics: StatisticsService) {}

  async excel(filters: ExportFilters = {}): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "南美白对虾塘口价格监测工具";
    workbook.created = new Date();
    const averages = this.statistics.regionSeries(filters);
    const summary = workbook.addWorksheet("每日均价");
    summary.columns = [
      { header: "日期", key: "date", width: 14 }, { header: "区域", key: "region", width: 14 }, { header: "规格(尾/斤)", key: "spec", width: 14 },
      { header: "均价(元/斤)", key: "price", width: 16 }, { header: "同比(%)", key: "yoy", width: 12 }, { header: "周环比(%)", key: "wow", width: 12 },
      { header: "90天位置", key: "position", width: 12 }, { header: "有效来源数", key: "sources", width: 14 }, { header: "覆盖县区数", key: "counties", width: 14 }
    ];
    for (const item of averages) {
      const dashboard = this.statistics.dashboard(item.date, item.regionCode, item.specification);
      summary.addRow({ date: item.date, region: item.regionCode, spec: item.specification, price: item.price, yoy: dashboard.yearOverYear.percent,
        wow: dashboard.weekOverWeek.percent, position: positionLabel(dashboard.historyPosition), sources: item.sourceCount, counties: item.countyCoverage });
    }
    styleSheet(summary);

    const raw = workbook.addWorksheet("原始报价");
    raw.columns = [
      { header: "报价日期", key: "date", width: 14 }, { header: "区域", key: "region", width: 12 }, { header: "县区", key: "county", width: 14 },
      { header: "层级", key: "granularity", width: 10 }, { header: "规格(尾/斤)", key: "spec", width: 14 }, { header: "价格(元/斤)", key: "price", width: 14 },
      { header: "价格类型", key: "type", width: 12 }, { header: "是否计入均价", key: "included", width: 14 }, { header: "状态/原因", key: "reason", width: 26 },
      { header: "来源", key: "source", width: 18 }, { header: "标题", key: "title", width: 36 }, { header: "链接", key: "url", width: 50 }, { header: "原文证据", key: "evidence", width: 56 }
    ];
    for (const quote of this.database.listQuotes({ ...filters, includeRejected: true })) raw.addRow({
      date: quote.quotedAt, region: quote.regionCode, county: quote.county ?? "区域参考价", granularity: quote.granularity,
      spec: quote.specification, price: quote.price, type: quote.priceType, included: quote.includedInAverage ? "是" : "否",
      reason: quote.exclusionReason ?? quote.status, source: quote.source.name, title: quote.source.title, url: quote.source.url, evidence: quote.evidence
    });
    for (let row = 2; row <= raw.rowCount; row += 1) {
      const cell = raw.getRow(row).getCell("url"); cell.value = { text: String(cell.value), hyperlink: String(cell.value) }; cell.font = { color: { argb: "FF0563C1" }, underline: true };
    }
    styleSheet(raw);
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }
}

function styleSheet(sheet: ExcelJS.Worksheet): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B5B" } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}
function positionLabel(value: string): string { return ({ high: "高位", middle: "中位", low: "低位", insufficient: "数据不足" } as Record<string, string>)[value] ?? value; }
