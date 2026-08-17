import { useState } from "react";
import { Alert, App as AntdApp, Button, Card, Checkbox, Form, Input, InputNumber, Progress, Space, Steps, Typography } from "antd";
import type { AiConnectionConfig, CollectionProgress, RegionCode } from "../../../src/domain/models";
import { backendApi, type SettingsSnapshot } from "../api";
import { AI_STATUS_LABELS, COLLECTION_STATE_LABELS, REGION_OPTIONS, SPECIFICATION_OPTIONS } from "../constants";

interface Props {
  initialSettings: SettingsSnapshot;
  onComplete: () => void;
}

export default function OnboardingWizard({ initialSettings, onComplete }: Props) {
  const { message } = AntdApp.useApp();
  const [step, setStep] = useState(0);
  const [ai, setAi] = useState<AiConnectionConfig>(initialSettings.ai);
  const [apiKey, setApiKey] = useState("");
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [regions, setRegions] = useState<RegionCode[]>(initialSettings.followedRegions);
  const [specs, setSpecs] = useState<number[]>(initialSettings.followedSpecifications);
  const [progress, setProgress] = useState<CollectionProgress | null>(null);
  const [finishing, setFinishing] = useState(false);

  const testConnection = async () => {
    setTesting(true);
    try {
      const result = await backendApi.testSettings(ai, apiKey || undefined);
      if (result.status === "success") {
        setTested(true);
        message.success("DeepSeek 连接成功");
      } else {
        setTested(false);
        message.error(`${AI_STATUS_LABELS[result.status]}：${result.message}`);
      }
    } catch (error) {
      setTested(false);
      message.error((error as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      const result = await backendApi.saveSettings(
        { ...initialSettings, ai, followedRegions: regions, followedSpecifications: specs, onboardingComplete: true },
        apiKey || undefined
      );
      if (result.status !== "success") {
        message.warning(`设置已保存，但连接测试未通过：${result.message}。AI 采集已禁用，可在设置页重新配置。`);
        onComplete();
        return;
      }
      const unsubscribe = window.shrimp.onCollectionProgress((event) => {
        setProgress(event);
        if (["completed", "cancelled", "failed"].includes(event.state)) {
          unsubscribe();
          setTimeout(onComplete, 800);
        }
      });
      setProgress(await backendApi.runCollection("daily"));
    } catch (error) {
      message.error((error as Error).message);
      setFinishing(false);
    }
  };

  const percent = progress && progress.limit > 0 ? Math.round((progress.analyzed / progress.limit) * 100) : 0;

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: "0 24px" }}>
      <Card>
        <Typography.Title level={3}>首次使用配置</Typography.Title>
        <Steps
          current={step}
          items={[{ title: "DeepSeek 连接" }, { title: "关注区域与规格" }, { title: "开始采集" }]}
          style={{ marginBottom: 32 }}
        />

        {step === 0 && (
          <Form layout="vertical">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="API Key 仅保存在本机 Windows 凭据管理器中，不会写入数据库、日志或备份。"
            />
            <Form.Item label="接口地址">
              <Input
                value={ai.baseUrl}
                onChange={(event) => {
                  setAi({ ...ai, baseUrl: event.target.value });
                  setTested(false);
                }}
              />
            </Form.Item>
            <Form.Item label="模型">
              <Input
                value={ai.model}
                onChange={(event) => {
                  setAi({ ...ai, model: event.target.value });
                  setTested(false);
                }}
              />
            </Form.Item>
            <Form.Item label="超时（毫秒）">
              <InputNumber
                style={{ width: "100%" }}
                min={5000}
                max={120000}
                value={ai.timeoutMs}
                onChange={(value) => {
                  setAi({ ...ai, timeoutMs: value ?? 30000 });
                  setTested(false);
                }}
              />
            </Form.Item>
            <Form.Item label="DeepSeek API Key">
              <Input.Password
                value={apiKey}
                placeholder="sk-..."
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setTested(false);
                }}
              />
            </Form.Item>
            <Space>
              <Button onClick={() => void testConnection()} loading={testing} disabled={!apiKey}>
                测试连接
              </Button>
              <Button type="primary" disabled={!tested} onClick={() => setStep(1)}>
                下一步
              </Button>
            </Space>
          </Form>
        )}

        {step === 1 && (
          <Form layout="vertical">
            <Form.Item label="关注区域">
              <Checkbox.Group
                options={REGION_OPTIONS}
                value={regions}
                onChange={(values) => setRegions(values as RegionCode[])}
              />
            </Form.Item>
            <Form.Item label="关注规格（尾/斤）">
              <Checkbox.Group
                options={SPECIFICATION_OPTIONS}
                value={specs}
                onChange={(values) => setSpecs(values as number[])}
              />
            </Form.Item>
            <Space>
              <Button onClick={() => setStep(0)}>上一步</Button>
              <Button type="primary" disabled={regions.length === 0 || specs.length === 0} onClick={() => setStep(2)}>
                下一步
              </Button>
            </Space>
          </Form>
        )}

        {step === 2 && (
          <div>
            <Typography.Paragraph>
              点击「完成并开始采集」后立即执行当日采集。采集过程中可随时取消；历史补采可在之后于「今日行情」页手动触发。
            </Typography.Paragraph>
            {progress && (
              <div style={{ marginBottom: 16 }}>
                <Typography.Text>
                  {COLLECTION_STATE_LABELS[progress.state]} · 已分析 {progress.analyzed}/{progress.limit} · 采纳 {progress.accepted} · 弃用 {progress.rejected}
                </Typography.Text>
                <Progress percent={percent} status={progress.state === "failed" ? "exception" : "active"} />
                <Typography.Text type="secondary">{progress.message}</Typography.Text>
              </div>
            )}
            <Space>
              <Button onClick={() => setStep(1)} disabled={finishing}>
                上一步
              </Button>
              <Button type="primary" loading={finishing} onClick={() => void finish()}>
                完成并开始采集
              </Button>
            </Space>
          </div>
        )}
      </Card>
    </div>
  );
}