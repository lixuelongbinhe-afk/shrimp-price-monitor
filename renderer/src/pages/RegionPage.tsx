import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Card, DatePicker, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import type { DailyAverage, RegionAverage, RegionCode, ValidatedQuote } from "../../../src/domain/models";
import { backendApi } from "../api";
import { priceTypeLabel, REGION_OPTIONS, regionName, SPECIFICATION_OPTIONS } from "../constants";

interface Props {
  dataVersion: number;
}

export default function RegionPage({ dataVersion }: Props) {
  const { message } = AntdApp.useApp();
  const [regionCode, setRegionCode] = useState<RegionCode>("zhangzhou");
  const [specification, setSpecification] = useState<number>(40);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, "day"), dayjs()]);
  const [regionSeries, setRegionSeries] = useState<RegionAverage[]>([]);
  const [countySeries, setCountySeries] = useState<DailyAverage[]>([]);
  const [referenceQuotes, setReferenceQuotes] = useState<ValidatedQuote[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        from: range[0].format("YYYY-MM-DD"),
        to: range[1].format("YYYY-MM-DD"),
        regionCode,
        specification
      };
      const [regionRows, countyRows, quotes] = await Promise.all([
        backendApi.regionSeries(filters),
        backendApi.countySeries(filters),
        backendApi.listQuotes(filters)
      ]);
      setRegionSeries([...regionRows].reverse());
      setCountySeries([...countyRows].reverse());
      setReferenceQuotes(quotes.filter((quote) => quote.granularity === "region" && quote.status === "accepted"));
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, regionCode, specification, message]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const regionColumns: ColumnsType<RegionAverage> = [
    { title: "日期", dataIndex: "date", width: 110 },
    { title: "区域均价（元/斤）", dataIndex: "price", render: (value: number) => value.toFixed(1) },
    { title: "县区覆盖", dataIndex: "countyCoverage", render: (value: number) => `${value} 个` },
    { title: "来源数", dataIndex: "sourceCount" },
    {
      title: "备注",
      dataIndex: "singleSource",
      render: (single: boolean) => (single ? <Tag color="orange">单一来源</Tag> : null)
    }
  ];

  const countyColumns: ColumnsType<DailyAverage> = [
    { title: "日期", dataIndex: "date", width: 110 },
    { title: "县区", dataIndex: "county" },
    { title: "日均价（元/斤）", dataIndex: "price", render: (value: number) => value.toFixed(1) },
    { title: "来源数", dataIndex: "sourceCount" },
    {
      title: "备注",
      dataIndex: "singleSource",
      render: (single: boolean) => (single ? <Tag color="orange">单一来源</Tag> : null)
    }
  ];

  const referenceColumns: ColumnsType<ValidatedQuote> = [
    { title: "日期", dataIndex: "quotedAt", width: 110 },
    { title: "参考价（元/斤）", dataIndex: "price", render: (value: number) => value.toFixed(1) },
    { title: "价格类型", dataIndex: "priceType", render: priceTypeLabel },
    { title: "来源", render: (_, record) => record.source.name },
    { title: "证据", dataIndex: "evidence", ellipsis: true }
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space wrap>
        <Segmented options={REGION_OPTIONS} value={regionCode} onChange={(value) => setRegionCode(value as RegionCode)} />
        <Select
          style={{ width: 130 }}
          options={SPECIFICATION_OPTIONS}
          value={specification}
          onChange={setSpecification}
        />
        <DatePicker.RangePicker
          value={range}
          allowClear={false}
          onChange={(value) => { if (value && value[0] && value[1]) setRange([value[0], value[1]]); }}
        />
        <Typography.Text type="secondary">{regionName(regionCode)} · {specification} 尾/斤</Typography.Text>
      </Space>

      <Card title="区域日均（县区等权）" size="small">
        <Table
          rowKey="date"
          size="small"
          loading={loading}
          columns={regionColumns}
          dataSource={regionSeries}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Card title="县区日均" size="small">
        <Table
          rowKey={(record) => `${record.date}-${record.county}`}
          size="small"
          loading={loading}
          columns={countyColumns}
          dataSource={countySeries}
          pagination={{ pageSize: 10 }}
        />
      </Card>
      <Card title="区域参考价（非县区口径，不参与均价）" size="small">
        <Table
          rowKey={(record) => String(record.id)}
          size="small"
          loading={loading}
          columns={referenceColumns}
          dataSource={referenceQuotes}
          pagination={{ pageSize: 5 }}
        />
      </Card>
    </Space>
  );
}