// 开发种子数据：仅用于界面开发，绝不进入打包产物。
// 用法：node scripts/seed-dev-data.mjs [数据库路径]（默认 dev-data/shrimp-monitor.sqlite）
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { AppDatabase, REGIONS } from "../dist/src/index.js";

const dbPath = process.argv[2] ?? resolve("dev-data/shrimp-monitor.sqlite");
const database = new AppDatabase(dbPath);

database.db.exec("DELETE FROM quotes; DELETE FROM sources; DELETE FROM collection_logs; DELETE FROM collection_runs; DELETE FROM document_cache;");

let state = 42;
const rand = () => {
  state = (state * 1103515245 + 12345) % 2 ** 31;
  return state / 2 ** 31;
};

const SPECIFICATIONS = [30, 40, 50, 60, 70, 80];
const BASE_PRICE = { 30: 28.0, 40: 25.5, 50: 23.0, 60: 21.0, 70: 19.0, 80: 17.5 };
const REGION_OFFSET = { zhangzhou: 0, yuedong: -1.2, rudong: 1.5 };
const PRICE_TYPES = ["pond_gate", "pond_head", "purchase"];
const SOURCE_NAMES = ["中国水产养殖网", "农财宝典水产版", "海大农牧", "水产前沿", "虾价速递"];

const formatDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

let inserted = 0;
const insertQuote = (quote) => {
  database.insertQuote(quote);
  inserted += 1;
};

const today = new Date();
for (let dayOffset = 150; dayOffset >= 0; dayOffset -= 1) {
  if (rand() < 0.15 && dayOffset > 0) continue;
  const date = new Date(today);
  date.setDate(date.getDate() - dayOffset);
  const dateStr = formatDate(date);
  const seasonal = Math.sin((dayOffset / 150) * Math.PI * 2) * 2.5;

  for (const [regionCode, region] of Object.entries(REGIONS)) {
    for (const spec of SPECIFICATIONS) {
      if (rand() < 0.2) continue;
      const center = BASE_PRICE[spec] + REGION_OFFSET[regionCode] + seasonal + (rand() - 0.5) * 1.6;
      const countyCount = 1 + Math.floor(rand() * Math.min(3, region.counties.length));
      const usedCounties = new Set();
      for (let index = 0; index < countyCount; index += 1) {
        const county = region.counties[Math.floor(rand() * region.counties.length)];
        if (usedCounties.has(county)) continue;
        usedCounties.add(county);
        const price = Math.round((center + (rand() - 0.5) * 1.2) * 10) / 10;
        const hash = createHash("sha256").update(`${dateStr}-${regionCode}-${county}-${spec}-${index}`).digest("hex").slice(0, 16);
        const sourceName = SOURCE_NAMES[Math.floor(rand() * SOURCE_NAMES.length)];
        insertQuote({
          species: "南美白对虾",
          regionCode,
          county,
          granularity: "county",
          quotedAt: dateStr,
          specification: spec,
          specificationUnit: "尾/斤",
          price,
          priceUnit: "元/斤",
          priceType: PRICE_TYPES[Math.floor(rand() * PRICE_TYPES.length)],
          evidence: `${dateStr} ${county} 南美白对虾 ${spec}尾/斤 塘口参考价 ${price}元/斤`,
          source: {
            name: sourceName,
            url: `https://example.com/quotes/${hash}`,
            title: `${dateStr} 对虾塘口价格行情`,
            publishedAt: dateStr,
            collectedAt: new Date().toISOString(),
            contentHash: hash
          },
          status: "accepted",
          exclusionReason: null,
          includedInAverage: true
        });
      }
      if (rand() < 0.2) {
        const hash = createHash("sha256").update(`bad-${dateStr}-${regionCode}-${spec}`).digest("hex").slice(0, 16);
        insertQuote({
          species: "南美白对虾",
          regionCode,
          county: region.counties[0],
          granularity: "county",
          quotedAt: dateStr,
          specification: spec,
          specificationUnit: "尾/斤",
          price: Math.round(center * 2.1 * 10) / 10,
          priceUnit: "元/斤",
          priceType: "pond_gate",
          evidence: `${dateStr} 异常报价样本（单位混淆）`,
          source: {
            name: "虾价速递",
            url: `https://example.com/quotes/${hash}`,
            title: `${dateStr} 对虾报价`,
            publishedAt: dateStr,
            collectedAt: new Date().toISOString(),
            contentHash: hash
          },
          status: "rejected",
          exclusionReason: "价格偏离同县区中位数超过 20%",
          includedInAverage: false
        });
      }
    }
    if (rand() < 0.3) {
      const spec = SPECIFICATIONS[Math.floor(rand() * SPECIFICATIONS.length)];
      const hash = createHash("sha256").update(`region-${dateStr}-${regionCode}-${spec}`).digest("hex").slice(0, 16);
      insertQuote({
        species: "南美白对虾",
        regionCode,
        county: null,
        granularity: "region",
        quotedAt: dateStr,
        specification: spec,
        specificationUnit: "尾/斤",
        price: Math.round((BASE_PRICE[spec] + REGION_OFFSET[regionCode] + seasonal) * 10) / 10,
        priceUnit: "元/斤",
        priceType: "pond_gate",
        evidence: `${dateStr} ${region.name} 区域参考价`,
        source: {
          name: "水产前沿",
          url: `https://example.com/quotes/${hash}`,
          title: `${dateStr} ${region.name} 对虾行情综述`,
          publishedAt: dateStr,
          collectedAt: new Date().toISOString(),
          contentHash: hash
        },
        status: "accepted",
        exclusionReason: null,
        includedInAverage: false
      });
    }
  }
}

database.log({ level: "info", stage: "seed", message: `开发种子数据已生成（${inserted} 条报价），仅用于界面开发` });
database.log({ level: "warning", stage: "seed", message: "示例警告：某来源连续 3 次访问失败", url: "https://example.com/quotes" });

const settings = database.getSettings();
database.saveSettings({ ...settings, onboardingComplete: true, aiEnabled: false });
database.close();
console.log(`种子数据已写入 ${dbPath}（${inserted} 条报价）`);