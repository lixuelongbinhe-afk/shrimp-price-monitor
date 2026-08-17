import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntdApp, Card, Empty, Radio, Select, Space, Typography } from "antd";
import dayjs from "dayjs";
import type { DailyAverage, RegionCode } from "../../../src/domain/models";
import { backendApi } from "../api";
import { REGIONS, REGION_OPTIONS, SPECIFICATION_OPTIONS } from "../constants";
import TrendChart from "../components/TrendChart";

interface Props {
  dataVersion: number;
}

export default function TrendsPage({ dataVersion }: Props) {
  const { message } = AntdApp.useApp();
  const [regionCode, setRegionCode] = useState<RegionCode>("zhangzhou");
  const [specification, setSpecification] = useState<number>(40);
  const [county, setCounty] = useState<string | null>(null);
  const [days, setDays] = useState(90);
  const [series, setSeries] = useState<DailyAverage[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        from: dayjs().subtract(days, "day").format("YYYY-MM-DD"),
        to: dayjs().format("YYYY-MM-DD"),
        regionCode,
        specification
      };
      const rows = county ? await backendApi.countySeries(filters) : await backendApi.regionSeries(filters);
      setSeries(county ? rows.filter((row) => row.county === county) : rows);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [regionCode, specification, county, days, message]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const option = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 24, top: 32, bottom: 32 },
      xAxis: { type: "time" },
      yAxis: { type: "value", name: "元/斤", scale: true },
      series: [
        {
          type: "line",
          name: "日均价格",
          connectNulls: false,
          showSymbol: true,
          symbolSize: 6,
          data: series.map((row) => [row.date, row.price])
        }
      ]
    }),
    [series]
  );

  const countyOptions = [
    { label: "区域整体", value: "" },
    ...REGIONS[regionCode].counties.map((name) => ({ label: name, value: name }))
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap>
        <Select style={{ width: 130 }} options={REGION_OPTIONS} value={regionCode} onChange={(value) => { setRegionCode(value as RegionCode); setCounty(null); }} />
        <Select style={{ width: 130 }} options={SPECIFICATION_OPTIONS} value={specification} onChange={setSpecification} />
        <Select
          style={{ width: 150 }}
          options={countyOptions}
          value={county ?? ""}
          onChange={(value) => setCounty(value === "" ? null : value)}
        />
        <Radio.Group
          value={days}
          onChange={(event) => setDays(event.target.value as number)}
          options={[
            { label: "近 30 天", value: 30 },
            { label: "近 90 天", value: 90 },
            { label: "近一年", value: 365 }
          ]}
          optionType="button"
        />
        {loading && <Typography.Text type="secondary">加载中…</Typography.Text>}
      </Space>
      <Card size="small">
        {series.length === 0 && !loading ? (
          <Empty description="所选条件下暂无数据（历史数据为稀疏采集，不会补点）" />
        ) : (
          <TrendChart option={option} />
        )}
      </Card>
    </Space>
  );
}