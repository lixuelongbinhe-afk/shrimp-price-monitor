import type { Clock } from "../domain/providers.js";
import { systemClock } from "../domain/providers.js";
import { AppDatabase } from "../infrastructure/database.js";
import { CollectionService } from "./collection-service.js";

export class CollectionScheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly database: AppDatabase, private readonly collection: CollectionService, private readonly clock: Clock = systemClock) {}
  start(): void {
    if (this.timer) return;
    void this.runIfDue(true);
    this.timer = setInterval(() => void this.runIfDue(), 60_000);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async runIfDue(startup = false): Promise<boolean> {
    const now = this.clock.now(); const date = now.toISOString().slice(0, 10); const settings = this.database.getSettings();
    const localTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (!settings.aiEnabled || this.database.hasCompletedRun(date) || (!startup && localTime < settings.collectionTime)) return false;
    if (this.collection.getProgress().state !== "idle") return false;
    await this.collection.run("daily"); return true;
  }
}
