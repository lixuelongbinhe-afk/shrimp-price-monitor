import { expect, test, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function launchApp(dbPath: string, userDataDirectory: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDirectory}`],
    env: { ...process.env, SHRIMP_MONITOR_DB: dbPath }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

test("主界面：六个页面可导航，今日行情展示数据卡片", async () => {
  const directory = mkdtempSync(join(tmpdir(), "shrimp-e2e-"));
  const dbPath = join(directory, "e2e.sqlite");
  execFileSync(process.execPath, ["scripts/seed-dev-data.mjs", dbPath], { cwd: process.cwd(), stdio: "pipe" });

  const { app, page } = await launchApp(dbPath, directory);
  try {
    await expect(page.getByRole("menuitem", { name: "今日行情" })).toBeVisible();
    await expect(page.locator(".ant-card").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("元/斤").first()).toBeVisible();

    for (const name of ["地区行情", "历史趋势", "数据来源", "导出备份", "设置"]) {
      await page.getByRole("menuitem", { name }).click();
      await expect(page.getByRole("menuitem", { name })).toHaveClass(/ant-menu-item-selected/);
    }

    await page.getByRole("menuitem", { name: "数据来源" }).click();
    await expect(page.getByRole("tab", { name: /报价记录/ })).toBeVisible();
    await page.getByRole("tab", { name: /采集日志/ }).click();
    await expect(page.getByText("开发种子数据已生成", { exact: false }).first()).toBeVisible();

    await page.getByRole("menuitem", { name: "设置" }).click();
    await expect(page.getByText("DeepSeek 与采集偏好")).toBeVisible();
    await expect(page.getByText("固定来源", { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("首次启动：未完成配置时显示向导", async () => {
  const directory = mkdtempSync(join(tmpdir(), "shrimp-e2e-fresh-"));
  const { app, page } = await launchApp(join(directory, "fresh.sqlite"), directory);
  try {
    await expect(page.getByText("首次使用配置")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("DeepSeek API Key")).toBeVisible();
  } finally {
    await app.close();
  }
});
