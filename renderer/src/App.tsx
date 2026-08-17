import { useCallback, useEffect, useState } from "react";
import { App as AntdApp, Button, Layout, Menu, Result, Spin } from "antd";
import {
  DashboardOutlined,
  EnvironmentOutlined,
  LineChartOutlined,
  DatabaseOutlined,
  ExportOutlined,
  SettingOutlined
} from "@ant-design/icons";
import type { CollectionProgress } from "../../src/domain/models";
import { backendApi, type SettingsSnapshot } from "./api";
import CollectionStatus from "./components/CollectionStatus";
import OnboardingWizard from "./pages/OnboardingWizard";
import DashboardPage from "./pages/DashboardPage";
import RegionPage from "./pages/RegionPage";
import TrendsPage from "./pages/TrendsPage";
import SourcesPage from "./pages/SourcesPage";
import ExportBackupPage from "./pages/ExportBackupPage";
import SettingsPage from "./pages/SettingsPage";

type PageKey = "dashboard" | "region" | "trends" | "sources" | "export" | "settings";

const MENU_ITEMS = [
  { key: "dashboard", icon: <DashboardOutlined />, label: "今日行情" },
  { key: "region", icon: <EnvironmentOutlined />, label: "地区行情" },
  { key: "trends", icon: <LineChartOutlined />, label: "历史趋势" },
  { key: "sources", icon: <DatabaseOutlined />, label: "数据来源" },
  { key: "export", icon: <ExportOutlined />, label: "导出备份" },
  { key: "settings", icon: <SettingOutlined />, label: "设置" }
];

export default function App() {
  const { message } = AntdApp.useApp();
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState<PageKey>("dashboard");
  const [progress, setProgress] = useState<CollectionProgress | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const reloadSettings = useCallback(async () => {
    try {
      setSettings(await backendApi.getSettings());
    } catch (error) {
      setLoadError((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    const unsubscribe = window.shrimp.onCollectionProgress((event) => {
      setProgress(event);
      if (event.state === "completed") {
        setDataVersion((version) => version + 1);
        message.success(`采集完成：采纳 ${event.accepted} 条，弃用 ${event.rejected} 条`);
      } else if (event.state === "failed") {
        message.error(`采集失败：${event.message}`);
      }
    });
    backendApi
      .collectionProgress()
      .then((snapshot) => {
        if (snapshot.state !== "idle") setProgress(snapshot);
      })
      .catch(() => undefined);
    return unsubscribe;
  }, [message]);

  if (loadError) {
    return (
      <Result
        status="error"
        title="后端初始化失败"
        subTitle={loadError}
        extra={<Button onClick={() => window.location.reload()}>重新加载</Button>}
      />
    );
  }
  if (!settings) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <Spin size="large" tip="正在启动本地后端…" />
      </div>
    );
  }
  if (!settings.onboardingComplete) {
    return <OnboardingWizard initialSettings={settings} onComplete={() => void reloadSettings()} />;
  }

  const pages: Record<PageKey, React.ReactNode> = {
    dashboard: <DashboardPage settings={settings} progress={progress} dataVersion={dataVersion} />,
    region: <RegionPage dataVersion={dataVersion} />,
    trends: <TrendsPage dataVersion={dataVersion} />,
    sources: <SourcesPage dataVersion={dataVersion} />,
    export: (
      <ExportBackupPage
        onRestored={() => {
          setDataVersion((version) => version + 1);
          void reloadSettings();
        }}
      />
    ),
    settings: <SettingsPage settings={settings} onSaved={() => void reloadSettings()} />
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Layout.Sider theme="light" width={180}>
        <div style={{ padding: "16px 12px", fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>
          南美白对虾
          <br />
          价格监测
        </div>
        <Menu
          mode="inline"
          selectedKeys={[page]}
          items={MENU_ITEMS}
          onClick={({ key }) => setPage(key as PageKey)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            borderBottom: "1px solid #f0f0f0"
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            {MENU_ITEMS.find((item) => item.key === page)?.label}
          </span>
          <CollectionStatus progress={progress} />
        </Layout.Header>
        <Layout.Content style={{ padding: 24, overflow: "auto" }}>{pages[page]}</Layout.Content>
      </Layout>
    </Layout>
  );
}