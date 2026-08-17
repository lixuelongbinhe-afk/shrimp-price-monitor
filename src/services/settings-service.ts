import type { AiConnectionResult, UserSettings } from "../domain/models.js";
import type { AiProvider, CredentialStore } from "../domain/providers.js";
import { AppDatabase } from "../infrastructure/database.js";

export class SettingsService {
  constructor(private readonly database: AppDatabase, private readonly ai: AiProvider, private readonly credentials: CredentialStore) {}
  get(): UserSettings & { hasApiKey: boolean } { throw new Error("请调用 getAsync() 以读取 hasApiKey"); }
  async getAsync(): Promise<UserSettings & { hasApiKey: boolean }> { return { ...this.database.getSettings(), hasApiKey: Boolean(await this.credentials.get()) }; }

  async test(config: UserSettings["ai"], apiKey?: string): Promise<AiConnectionResult> {
    const secret = apiKey ?? await this.credentials.get();
    if (!secret) return { status: "invalid_key", message: "API Key 为空" };
    return this.ai.testConnection(config, secret);
  }

  async save(settings: UserSettings, apiKey?: string): Promise<AiConnectionResult> {
    const result = await this.test(settings.ai, apiKey);
    if (apiKey) await this.credentials.set(apiKey);
    this.database.saveSettings({ ...settings, aiEnabled: result.status === "success" });
    return result;
  }

  async deleteApiKey(): Promise<void> {
    await this.credentials.delete();
    this.database.saveSettings({ ...this.database.getSettings(), aiEnabled: false });
  }
}
