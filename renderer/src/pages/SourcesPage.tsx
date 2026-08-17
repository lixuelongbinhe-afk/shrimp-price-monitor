import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Card, DatePicker, Select, Space, Switch, Table, Tabs, Tag, Typography } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { ColumnsType } from "antd/es/table";
import type { CollectionLogEntry, RegionCode, ValidatedQuote } from "../../../src/domain/models";
import { backendApi } from "../api";
import { priceTypeLabel, QUOTE_STATUS_META, REGION_OPTIONS, regionName, SPECIFICATION_OPTIONS } from "../constants";

interface Props {
  dataVersion: number;
}

const LEVEL_COLORS: Record<CollectionLogEntry["level"], string> = {
  info: "blue",
  warning: "orange",
  error: "red"
};

export default function SourcesPage({ dataVersion }: Props) {
  const { message } = AntdApp.useApp();
  const [quotes, setQuotes] = useState<ValidatedQuote[]>([]);
  const [logs, setLogs] = useState<CollectionLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeRejected, setIncludeRejected] = useState(true);
  const [regionCode, setRegionCode] = useState<RegionCode | undefined>();
  const [specification, setSpecification] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(14, "day"), dayjs()]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [quoteRows, logRows] = await Promise.all([
        backendApi.listQuotes({
          from: range[0].format("YYYY-MM-DD"),
          to: range[1].format("YYYY-MM-DD"),
          includeRejected,
          ...(regionCode ? { regionCode } : {}),
          ...(specification ? { specification } : {})
        }),
        backendApi.listLogs(500)
      ]);
      setQuotes(quoteRows);
      setLogs(logRows);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, includeRejected, regionCode, specification, message]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const openLink = (url: string) => {
    void window.shrimp.openExternal(url).catch((error: Error) => message.error(error.message));
  };

  const quoteColumns: ColumnsType<ValidatedQuote> = [
    { title: "报价日期", dataIndex: "quotedAt", width: 105 },
    { title: "区域", dataIndex: "regionCode", width: 100, render: (code: RegionCode) => regionName(code) },
    { title: "县区", dataIndex: "county", width: 90, render: (value: string | null) => value ?? "（区域级）" },
    { title: "规格", dataIndex: "specification", width: 80, render: (value: number) => `${value} 尾/斤` },
    { title: "价格", dataIndex: "price", width: 90, render: (value: number) => `${value.toFixed(1)} 元/斤` },
    { title: "类型", dataIndex: "priceType", width: 90, render: priceTypeLabel },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: ValidatedQuote["status"], record) => (
        <Tag color={QUOTE_STATUS_META[status].color} title={record.exclusionReason ?? undefined}>
          {QUOTE_STATUS_META[status].label}
        </Tag>
      )
    },
    {
      title: "来源",
      width: 160,
      render: (_, record) => (
        <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openLink(record.source.url)}>
          {record.source.name}
        </Button>
      )
    },
    { title: "证据", dataIndex: "evidence", ellipsis: true }
  ];

  const logColumns: ColumnsType<CollectionLogEntry> = [
    {
      title: "级别",
      dataIndex: "level",
      width: 80,
      render: (level: CollectionLogEntry["level"]) => <Tag color={LEVEL_COLORS[level]}>{level}</Tag>
    },
    { title: "阶段", dataIndex: "stage", width: 110 },
    { title: "内容", dataIndex: "message", ellipsis: true },
    {
      title: "链接",
      dataIndex: "url",
      width: 70,
      render: (url: string | undefined) =>
        url ? (
          <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openLink(url)} />
        ) : null
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 170,
      render: (value: string | undefined) => (value ? dayjs(value).format("MM-DD HH:mm:ss") : "")
    }
  ];

  return (
    <Card size="small">
      <Tabs
        items={[
          {
            key: "quotes",
            label: `报价记录（${quotes.length}）`,
            children: (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Space wrap>
                  <Select
                    allowClear
                    placeholder="全部区域"
                    style={{ width: 130 }}
                    options={REGION_OPTIONS}
                    value={regionCode}
                    onChange={(value) => setRegionCode(value as RegionCode | undefined)}
                  />
                  <Select
                    allowClear
                    placeholder="全部规格"
                    style={{ width: 130 }}
                    options={SPECIFICATION_OPTIONS}
                    value={specification}
                    onChange={(value) => setSpecification(value)}
                  />
                  <DatePicker.RangePicker
                    value={range}
                    allowClear={false}
                    onChange={(value) => { if (value && value[0] && value[1]) setRange([value[0], value[1]]); }}
                  />
                  <Typography.Text>
                    含已弃用 <Switch checked={includeRejected} onChange={setIncludeRejected} />
                  </Typography.Text>
                </Space>
                <Table
                  rowKey={(record) => String(record.id)}
                  size="small"
                  loading={loading}
                  columns={quoteColumns}
                  dataSource={quotes}
                  pagination={{ pageSize: 15, showSizeChanger: true }}
                />
              </Space>
            )
          },
          {
            key: "logs",
            label: `采集日志（${logs.length}）`,
            children: (
              <Table
                rowKey={(record, index) => `${record.createdAt ?? "log"}-${index}`}
                size="small"
                loading={loading}
                columns={logColumns}
                dataSource={logs}
                pagination={{ pageSize: 15 }}
              />
            )
          }
        ]}
      />
    </Card>
  );
}