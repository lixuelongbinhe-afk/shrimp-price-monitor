import { useCallback, useEffect, useState } from "react";
import {
  App as AntdApp,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  TimePicker,
  Typography
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import type { RegionCode } from "../../../src/domain/models";
import { backendApi, type FixedSource, type SettingsSnapshot } from "../api";
import { AI_STATUS_LABELS, REGION_OPTIONS, SPECIFICATION_OPTIONS } from "../constants";

interface Props {
  settings: SettingsSnapshot;
  onSaved: () => void;
}

export default function SettingsPage({ settings, onSaved }: Props) {
  const { message } = AntdApp.useApp();
  const [form] = Form.useForm();
  const [sources, setSources] = useState<FixedSource[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");

  const loadSources = useCallback(async () => {
    try {
      setSources(await backendApi.listFixedSources());
    } catch (error) {
      message.error((error as Error).message);
    }
  }, [message]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const formValues = () => {
    const values = form.getFieldsValue() as {
      baseUrl: string;
      model: string;
      timeoutMs: number;
      apiKey?: string;
      dailyLimit: number;
      collectionTime: dayjs.Dayjs;
      followedRegions: RegionCode[];
      followedSpecifications: number[];
    };
    return values;
  };

  const buildSettings = (): SettingsSnapshot => {
    const values = formValues();
    return {
      ...settings,
      ai: { baseUrl: values.baseUrl, model: values.model, timeoutMs: values.timeoutMs },
      dailyLimit: values.dailyLimit,
      collectionTime: values.collectionTime.format("HH:mm"),
      followedRegions: values.followedRegions ?? [],
      followedSpecifications: values.followedSpecifications ?? []
    };
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const current = buildSettings();
      const apiKey = formValues().apiKey?.trim();
      const result = await backendApi.testSettings(current.ai, apiKey ? apiKey : undefined);
      if (result.status === "success") message.success("连接成功");
      else message.warning(`${AI_STATUS_LABELS[result.status]}：${result.message}`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const next = buildSettings();
      const apiKey = formValues().apiKey?.trim();
      const result = await backendApi.saveSettings(next, apiKey ? apiKey : undefined);
      if (result.status === "success") {
        message.success("设置已保存，连接测试通过");
      } else {
        message.warning(`设置已保存，但连接测试未通过（${AI_STATUS_LABELS[result.status]}），AI 采集已禁用`);
      }
      form.setFieldValue("apiKey", "");
      onSaved();
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async () => {
    try {
      await backendApi.deleteApiKey();
      message.success("API Key 已删除，AI 采集已禁用");
      onSaved();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const addSource = async () => {
    try {
      await backendApi.addFixedSource(newSourceName, newSourceUrl);
      setNewSourceName("");
      setNewSourceUrl("");
      message.success("已添加来源");
      void loadSources();
    } catch (error) {
      message.error((error as Error).message);
    }
  };

  const sourceColumns: ColumnsType<FixedSource> = [
    { title: "名称", dataIndex: "name" },
    {
      title: "地址",
      dataIndex: "searchUrl",
      render: (url: string) => (
        <Button type="link" size="small" onClick={() => void window.shrimp.openExternal(url)}>
          {url}
        </Button>
      )
    },
    {
      title: "类型",
      width: 90,
      render: (_, record) => (record.builtin ? <Tag>内置</Tag> : <Tag color="blue">自定义</Tag>)
    },
    {
      title: "启用",
      width: 80,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(enabled) => {
            void backendApi.setFixedSourceEnabled(record.id, enabled).then(loadSources).catch((error: Error) => message.error(error.message));
          }}
        />
      )
    }
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%", maxWidth: 860 }}>
      <Card title="DeepSeek 与采集偏好" size="small">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            baseUrl: settings.ai.baseUrl,
            model: settings.ai.model,
            timeoutMs: settings.ai.timeoutMs,
            apiKey: "",
            dailyLimit: settings.dailyLimit,
            collectionTime: dayjs(settings.collectionTime, "HH:mm"),
            followedRegions: settings.followedRegions,
            followedSpecifications: settings.followedSpecifications
          }}
        >
          <Form.Item label="接口地址" name="baseUrl" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="模型" name="model" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="超时（毫秒）" name="timeoutMs" rules={[{ required: true }]}>
            <InputNumber min={5000} max={120000} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item
            label="API Key"
            name="apiKey"
            extra={settings.hasApiKey ? "本机已保存 Key（安全存储于 Windows 凭据管理器），输入新值可更换。" : "Key 仅保存在本机 Windows 凭据管理器。"}
          >
            <Input.Password placeholder={settings.hasApiKey ? "已保存，输入以更换" : "sk-..."} autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="每日网页分析上限（1-20）" name="dailyLimit" rules={[{ required: true }]}>
            <InputNumber min={1} max={20} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="定时采集时间" name="collectionTime" rules={[{ required: true }]}>
            <TimePicker format="HH:mm" minuteStep={5} allowClear={false} />
          </Form.Item>
          <Form.Item label="关注区域" name="followedRegions">
            <Checkbox.Group options={REGION_OPTIONS} />
          </Form.Item>
          <Form.Item label="关注规格（尾/斤）" name="followedSpecifications">
            <Checkbox.Group options={SPECIFICATION_OPTIONS} />
          </Form.Item>
        </Form>
        <Space wrap>
          <Button onClick={() => void testConnection()} loading={testing}>
            测试连接
          </Button>
          <Button type="primary" onClick={() => void saveAll()} loading={saving}>
            保存全部设置
          </Button>
          <Popconfirm title="删除本机保存的 API Key？" description="删除后 AI 采集将禁用。" onConfirm={() => void deleteKey()}>
            <Button danger disabled={!settings.hasApiKey}>
              删除 API Key
            </Button>
          </Popconfirm>
        </Space>
      </Card>

      <Card
        title="固定来源"
        size="small"
        extra={
          <Popconfirm title="恢复全部内置来源为启用状态？" onConfirm={() => void backendApi.restoreBuiltinSources().then(loadSources)}>
            <Button size="small">恢复内置来源</Button>
          </Popconfirm>
        }
      >
        <Table rowKey="id" size="small" columns={sourceColumns} dataSource={sources} pagination={false} />
        <Space style={{ marginTop: 12 }} wrap>
          <Input placeholder="来源名称" style={{ width: 180 }} value={newSourceName} onChange={(event) => setNewSourceName(event.target.value)} />
          <Input placeholder="https://…" style={{ width: 320 }} value={newSourceUrl} onChange={(event) => setNewSourceUrl(event.target.value)} />
          <Button icon={<PlusOutlined />} disabled={!newSourceName.trim() || !newSourceUrl.trim()} onClick={() => void addSource()}>
            添加来源
          </Button>
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
          固定来源用于采集优先级与信任标识，自定义来源默认为非信任来源。
        </Typography.Paragraph>
      </Card>
    </Space>
  );
}