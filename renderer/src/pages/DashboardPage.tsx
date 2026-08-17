import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Card, Col, Empty, Popconfirm, Row, Space, Statistic, Tag, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { CollectionProgress, DashboardMetric, RegionCode } from "../../../src/domain/models";
import { backendApi, type SettingsSnapshot } from "../api";
import { HISTORY_POSITION_META, regionName } from "../constants";
import { isCollectionRunning } from "../components/CollectionStatus";

interface Props {
  settings: SettingsSnapshot;
  progress: CollectionProgress | null;
  dataVersion: number;
}

interface DashboardEntry {
  regionCode: RegionCode;
  specification: number;
  metric: DashboardMetric;
}

function TrendValue({ value, percent, label }: { value: number | null; percent: number | null; label: string }) {
  if (value === null || percent === null) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}：无对比数据
      </Typography.Text>
    );
  }
  const up = percent >= 0;
  return (
    <Typography.Text style={{ fontSize: 12 }} type={up ? "danger" : "success"}>
      {label} {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {Math.abs(percent).toFixed(1)}%（{value.toFixed(1)} 元）
    </Typography.Text>
  );
}

export default function DashboardPage({ settings, progress, dataVersion }: Props) {
  const { message } = AntdApp.useApp();
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const today = dayjs().format("YYYY-MM-DD");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const combinations = settings.followedRegions.flatMap((regionCode) =>
        settings.followedSpecifications.map((specification) => ({ regionCode, specification }))
      );
      const results = await Promise.all(
        combinations.map(async ({ regionCode, specification }) => ({
          regionCode,
          specification,
          metric: await backendApi.dashboard(today, regionCode, specification)
        }))
      );
      setEntries(results);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [settings, today, message]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const running = isCollectionRunning(progress);
  const startCollection = async (kind: "daily" | "history") => {
    try {
      await backendApi.runCollection(kind);
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ReloadOutlined />} disabled={running} onClick={() => void startCollection("daily")}>
          立即采集今日行情
        </Button>
        <Popconfirm
          title="补采历史数据"
          description="将搜索并分析更早日期的报价页面，受每日分析上限约束。"
          onConfirm={() => void startCollection("history")}
        >
          <Button disabled={running}>补采历史</Button>
        </Popconfirm>
        <Button onClick={() => void load()}>刷新</Button>
        <Typography.Text type="secondary">统计日期：{today}</Typography.Text>
      </Space>

      {!loading && entries.length === 0 && <Empty description="尚未配置关注区域与规格，请前往设置页" />}
      <Row gutter={[16, 16]}>
        {entries.map(({ regionCode, specification, metric }) => (
          <Col xs={24} sm={12} lg={8} xxl={6} key={`${regionCode}-${specification}`}>
            <Card
              loading={loading}
              title={`${regionName(regionCode)} · ${specification} 尾/斤`}
              extra={<Tag color={HISTORY_POSITION_META[metric.historyPosition]?.color}>{HISTORY_POSITION_META[metric.historyPosition]?.label}</Tag>}
            >
              {metric.current ? (
                <Statistic value={metric.current.price} precision={1} suffix="元/斤" />
              ) : (
                <Statistic value="暂无今日数据" valueStyle={{ fontSize: 16, color: "#999" }} />
              )}
              {metric.current && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  来源 {metric.current.sourceCount} 个{metric.current.singleSource ? "（单一来源，仅供参考）" : ""}
                </Typography.Text>
              )}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                <TrendValue {...metric.yearOverYear} />
                <TrendValue {...metric.weekOverWeek} />
              </div>
              {metric.stale && (
                <Tag color="warning" style={{ marginTop: 8 }}>
                  数据过期{metric.latestDate ? `（最新 ${metric.latestDate}）` : ""}
                </Tag>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}