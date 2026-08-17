import type { ExtractedQuote, SourceRecord, ValidationResult, ValidatedQuote, PriceType } from "../domain/models.js";
import { resolveCounty, resolveRegion } from "../domain/regions.js";
import { detectPromptInjection } from "./security.js";

const POND_PRICE_WORDS = /(塘口价|塘头价|收购价)/;
const BAD_PRICE_WORDS = /(批发价|市场价|零售价)/;
const PRICE_TYPE_MAP: Record<string, PriceType> = {
  pond_gate: "pond_gate",
  pond_head: "pond_head",
  purchase: "purchase",
  塘口价: "pond_gate",
  塘头价: "pond_head",
  收购价: "purchase"
};

export function validateQuote(extracted: ExtractedQuote, source: SourceRecord): ValidationResult {
  const reasons: string[] = [];
  const injection = detectPromptInjection(`${source.title}\n${extracted.evidence}`);
  if (injection) reasons.push(injection);
  if (extracted.species !== "南美白对虾") reasons.push("品种不是南美白对虾");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(extracted.quotedAt) || Number.isNaN(Date.parse(`${extracted.quotedAt}T00:00:00Z`))) reasons.push("报价日期无效或缺失");
  if (!Number.isFinite(extracted.priceValue) || extracted.priceValue <= 0 || extracted.priceValue > 200) reasons.push("价格数值超出合法范围");
  if (!Number.isFinite(extracted.specificationValue) || extracted.specificationValue < 10 || extracted.specificationValue > 300) reasons.push("规格数值超出合法范围");
  if (!POND_PRICE_WORDS.test(extracted.evidence)) reasons.push("证据未明确出现塘口价、塘头价或收购价");
  if (BAD_PRICE_WORDS.test(extracted.evidence)) reasons.push("证据包含市场价、批发价或零售价");

  const regionCode = resolveRegion(`${extracted.regionText} ${extracted.countyText ?? ""}`);
  if (!regionCode) reasons.push("无法定位到支持的区域");

  const priceType = PRICE_TYPE_MAP[extracted.priceType];
  if (!priceType) reasons.push("价格类型不明确");

  const specification = normalizeSpecification(extracted.specificationValue, extracted.specificationUnit);
  if (specification === null) reasons.push("规格单位不明确");
  const price = normalizePrice(extracted.priceValue, extracted.priceUnit);
  if (price === null) reasons.push("价格单位不明确");

  const county = regionCode ? resolveCounty(regionCode, extracted.countyText) : null;
  if (extracted.granularity === "county" && !county) reasons.push("县区级报价无法定位到县区");

  if (reasons.length || !regionCode || !priceType || specification === null || price === null) return { ok: false, reasons };
  const quote: ValidatedQuote = {
    species: "南美白对虾",
    regionCode,
    county,
    granularity: county ? "county" : "region",
    quotedAt: extracted.quotedAt,
    specification,
    specificationUnit: "尾/斤",
    price: round2(price),
    priceUnit: "元/斤",
    priceType,
    evidence: extracted.evidence.trim(),
    source,
    status: "accepted",
    exclusionReason: null,
    includedInAverage: county !== null
  };
  return { ok: true, quote, reasons: [] };
}

function normalizeSpecification(value: number, unit: string): number | null {
  const normalized = unit.replace(/\s/g, "");
  if (["尾/斤", "尾每斤", "尾／斤", "头/斤", "头每斤"].includes(normalized)) return value;
  return null;
}

function normalizePrice(value: number, unit: string): number | null {
  const normalized = unit.replace(/\s/g, "");
  if (["元/斤", "元每斤", "元／斤"].includes(normalized)) return value;
  if (["元/公斤", "元每公斤", "元／公斤"].includes(normalized)) return value / 2;
  if (["元/千克", "元每千克", "元／千克"].includes(normalized)) return value / 2;
  return null;
}

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
