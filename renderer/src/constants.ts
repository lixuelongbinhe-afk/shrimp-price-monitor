import type { AiConnectionStatus, CollectionProgress, PriceType, QuoteStatus, RegionCode } from "../../src/domain/models";
import { REGIONS } from "../../src/domain/regions";

export { REGIONS };

export const REGION_OPTIONS = Object.values(REGIONS).map((region) => ({ label: region.name, value: region.code }));

export const SPECIFICATION_CHOICES = [30, 40, 50, 60, 70, 80];
export const SPECIFICATION_OPTIONS = SPECIFICATION_CHOICES.map((value) => ({ label: `${value} 尾/斤`, value }));

export const regionName = (code: RegionCode): string => REGIONS[code].name;

export const PRICE_TYPE_LABELS: Record<string, string> = {
  pond_gate: "塘口价",
  pond_head: "塘头价",
  purchase: "收购价"
};
export const priceTypeLabel = (type: PriceType | string): string => PRICE_TYPE_LABELS[type] ?? type;

export const QUOTE_STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  accepted: { label: "已采纳", color: "green" },
  rejected: { label: "已弃用", color: "red" },
  duplicate: { label: "重复转载", color: "orange" },
  anomaly: { label: "异常排除", color: "volcano" },
  ai_failed: { label: "AI 失败", color: "default" }
};

export const AI_STATUS_LABELS: Record<AiConnectionStatus, string> = {
  success: "连接成功",
  invalid_key: "API Key 无效或为空",
  invalid_url: "接口地址无效",
  model_unavailable: "模型不可用",
  network_error: "网络连接失败",
  quota_exceeded: "账户配额不足"
};

export const COLLECTION_STATE_LABELS: Record<CollectionProgress["state"], string> = {
  idle: "空闲",
  searching: "搜索来源",
  fetching: "抓取页面",
  analyzing: "AI 分析",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失败"
};

export const HISTORY_POSITION_META: Record<string, { label: string; color: string }> = {
  high: { label: "90 天高位", color: "red" },
  middle: { label: "90 天中位", color: "blue" },
  low: { label: "90 天低位", color: "green" },
  insufficient: { label: "历史数据不足", color: "default" }
};