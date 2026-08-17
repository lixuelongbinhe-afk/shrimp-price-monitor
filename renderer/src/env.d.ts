/// <reference types="vite/client" />
import type { CollectionProgress } from "../../src/domain/models";

export interface SaveFileResult {
  saved: boolean;
  filePath?: string;
}

export interface ReadFileResult {
  bytes: Uint8Array | null;
  filePath?: string;
}

export interface ShrimpBridge {
  invoke(method: string, payload?: unknown): Promise<unknown>;
  onCollectionProgress(listener: (progress: CollectionProgress) => void): () => void;
  openExternal(url: string): Promise<void>;
  saveBytes(bytes: Uint8Array, suggestedName: string): Promise<SaveFileResult>;
  readBytes(): Promise<ReadFileResult>;
}

declare global {
  interface Window {
    shrimp: ShrimpBridge;
  }
}

export {};