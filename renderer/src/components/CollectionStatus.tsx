import { Button, Progress, Space, Typography } from "antd";
import type { CollectionProgress } from "../../../src/domain/models";
import { backendApi } from "../api";
import { COLLECTION_STATE_LABELS } from "../constants";

export const isCollectionRunning = (progress: CollectionProgress | null): boolean =>
  progress !== null && ["searching", "fetching", "analyzing"].includes(progress.state);

export default function CollectionStatus({ progress }: { progress: CollectionProgress | null }) {
  if (!progress || progress.state === "idle") {
    return <Typography.Text type="secondary">采集器空闲</Typography.Text>;
  }
  const running = isCollectionRunning(progress);
  const percent = progress.limit > 0 ? Math.round((progress.analyzed / progress.limit) * 100) : 0;
  return (
    <Space size="middle">
      <Typography.Text type={progress.state === "failed" ? "danger" : "secondary"}>
        {COLLECTION_STATE_LABELS[progress.state]} · 已分析 {progress.analyzed}/{progress.limit} · 采纳 {progress.accepted} · 弃用 {progress.rejected}
      </Typography.Text>
      {running && (
        <>
          <Progress percent={percent} size="small" style={{ width: 160 }} status="active" />
          <Button size="small" danger onClick={() => void backendApi.cancelCollection()}>
            取消采集
          </Button>
        </>
      )}
    </Space>
  );
}