import type { RegionCode } from "./models.js";

export interface RegionDefinition {
  code: RegionCode;
  name: string;
  aliases: string[];
  counties: string[];
}

export const REGIONS: Record<RegionCode, RegionDefinition> = {
  zhangzhou: {
    code: "zhangzhou",
    name: "漳州区域",
    aliases: ["漳州", "漳州市"],
    counties: ["芗城区", "龙文区", "龙海区", "长泰区", "漳浦县", "云霄县", "东山县", "诏安县", "南靖县", "平和县", "华安县"]
  },
  yuedong: {
    code: "yuedong",
    name: "粤东区域",
    aliases: ["粤东", "汕头", "潮州", "揭阳", "汕尾"],
    counties: [
      "金平区", "龙湖区", "濠江区", "潮阳区", "潮南区", "澄海区", "南澳县",
      "湘桥区", "潮安区", "饶平县",
      "榕城区", "揭东区", "揭西县", "惠来县", "普宁市",
      "城区", "海丰县", "陆河县", "陆丰市"
    ]
  },
  rudong: {
    code: "rudong",
    name: "如东区域",
    aliases: ["如东", "如东县"],
    counties: ["如东县"]
  }
};

const normalize = (value: string): string => value.replace(/[省市县区\s]/g, "");

export function resolveRegion(regionText: string): RegionCode | null {
  const text = normalize(regionText);
  for (const region of Object.values(REGIONS)) {
    if (region.aliases.some((alias) => text.includes(normalize(alias)))) return region.code;
    if (region.counties.some((county) => text.includes(normalize(county)))) return region.code;
  }
  return null;
}

export function resolveCounty(regionCode: RegionCode, countyText?: string): string | null {
  if (!countyText) return null;
  const text = normalize(countyText);
  return REGIONS[regionCode].counties.find((county) => text.includes(normalize(county))) ?? null;
}
