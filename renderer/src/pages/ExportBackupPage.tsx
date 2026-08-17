import { useState } from "react";
import { App as AntdApp, Alert, Button, Card, DatePicker, Select, Space, Typography } from "antd";
import { DownloadOutlined, SaveOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { RegionCode } from "../../../src/domain/models";
import { backendApi } from "../api";
import { REGION_OPTIONS, SPECIFICATION_OPTIONS } from "../constants";

interface Props {
  onRestored: () => void;
}

export default function ExportBackupPage({ onRestored }: Props) {
  const { message, modal } = AntdApp.useApp();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, "day"), dayjs()]);
  const [regionCode, setRegionCode] = useState<RegionCode | undefined>();
  const [specification, setSpecification] = useState<number | undefined>();
  const [busy, setBusy] = useState<string | null>(null);

  const exportExcel = async () => {
    setBusy("export");
    try {
      const bytes = await backendApi.exportExcel({
        from: range[0].format("YYYY-MM-DD"),
        to: range[1].format("YYYY-MM-DD"),
        ...(regionCode ? { regionCode } : {}),
        ...(specification ? { specification } : {})
      });
      const result = await window.shrimp.saveBytes(
        bytes,
        `南美白对虾价格_${range[0].format("YYYYMMDD")}_${range[1].format("YYYYMMDD")}.xlsx`
      );
      if (result.saved) message.success(`已导出：${result.filePath}`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createBackup = async () => {
    setBusy("backup");
    try {
      const bytes = await backendApi.backupCreate();
      const result = await window.shrimp.saveBytes(bytes, `shrimp-backup-${dayjs().format("YYYYMMDD-HHmm")}.shrimp-backup`);
      if (result.saved) message.success(`备份已保存：${result.filePath}`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    setBusy("restore");
    try {
      const result = await window.shrimp.readBytes();
      if (!result.bytes) return;
      const confirmed = await modal.confirm({
        title: "确认恢复备份？",
        content: "恢复将覆盖当前全部价格数据与设置，并删除本机已保存的 API Key（恢复后需重新配置）。此操作不可撤销。",
        okText: "确认恢复",
        okButtonProps: { danger: true },
        cancelText: "取消"
      });
      if (!confirmed) return;
      await backendApi.backupRestore(result.bytes);
      message.success("备份已恢复，请重新配置 API Key");
      onRestored();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 720 }}>
      <Card title="导出 Excel" size="small">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Space wrap>
            <DatePicker.RangePicker
              value={range}
              allowClear={false}
              onChange={(value) => { if (value && value[0] && value[1]) setRange([value[0], value[1]]); }}
            />
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
              onChange={setSpecification}
            />
          </Space>
          <Button type="primary" icon={<DownloadOutlined />} loading={busy === "export"} onClick={() => void exportExcel()}>
            导出 Excel
          </Button>
        </Space>
      </Card>

      <Card title="数据备份" size="small">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            备份包含全部价格数据、来源、日志与设置，不包含 API Key。文件带 SHA-256 校验。
          </Typography.Text>
          <Button icon={<SaveOutlined />} loading={busy === "backup"} onClick={() => void createBackup()}>
            创建备份
          </Button>
        </Space>
      </Card>

      <Card title="恢复备份" size="small">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Alert type="warning" showIcon message="恢复会覆盖当前全部数据，并删除本机已保存的 API Key。" />
          <Button danger icon={<UndoOutlined />} loading={busy === "restore"} onClick={() => void restoreBackup()}>
            选择备份文件并恢复
          </Button>
        </Space>
      </Card>
    </Space>
  );
}