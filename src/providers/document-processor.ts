import * as cheerio from "cheerio";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createWorker, type Worker } from "tesseract.js";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { OcrProvider, PdfProvider } from "../domain/providers.js";
import type { RelevantDocument, SearchResult } from "../domain/models.js";
import { sha256 } from "../core/hash.js";

const RELEVANT_LINE = /(南美白对虾|白对虾|塘口价|塘头价|收购价|尾\s*[\/／每]\s*斤|元\s*[\/／每]\s*(斤|公斤|千克)|漳州|粤东|如东|汕头|潮州|揭阳|汕尾)/;

export class TesseractOcrProvider implements OcrProvider {
  private workerPromise: Promise<Worker> | null = null;
  async recognize(image: Uint8Array, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    this.workerPromise ??= createOfflineWorker();
    const worker = await this.workerPromise;
    signal?.throwIfAborted();
    const result = await worker.recognize(Buffer.from(image));
    return result.data.text;
  }
  async terminate(): Promise<void> { if (this.workerPromise) await (await this.workerPromise).terminate(); }
}

async function createOfflineWorker(): Promise<Worker> {
  const require = createRequire(import.meta.url);
  const chiDirectory = dirname(require.resolve("@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz"));
  const engDirectory = dirname(require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"));
  const { mkdtemp, copyFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const cacheDirectory = await mkdtemp(join(tmpdir(), "shrimp-ocr-"));
  if (chiDirectory !== engDirectory) {
    await Promise.all([
      copyFile(require.resolve("@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz"), join(cacheDirectory, "chi_sim.traineddata.gz")),
      copyFile(require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"), join(cacheDirectory, "eng.traineddata.gz"))
    ]);
    return createWorker("chi_sim+eng", 1, { langPath: cacheDirectory, cachePath: cacheDirectory, gzip: true });
  }
  return createWorker("chi_sim+eng", 1, { langPath: chiDirectory, cachePath: cacheDirectory, gzip: true });
}

export class PdfJsProvider implements PdfProvider {
  async extract(pdf: Uint8Array, ocr: OcrProvider, signal?: AbortSignal): Promise<string> {
    const task = getDocument({ data: Uint8Array.from(pdf), useWorkerFetch: false, useSystemFonts: true });
    const document = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      signal?.throwIfAborted();
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").trim();
      if (text.length >= 30) pages.push(text);
      else {
        const viewport = page.getViewport({ scale: 2 });
        const { createCanvas } = await import("@napi-rs/canvas");
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        await page.render({ canvas, canvasContext: context, viewport } as never).promise;
        pages.push(await ocr.recognize(canvas.toBuffer("image/png"), signal));
      }
    }
    return pages.join("\n\n");
  }
}

export class DocumentProcessor {
  constructor(private readonly ocr: OcrProvider, private readonly pdf: PdfProvider, private readonly fetchImpl: typeof fetch = fetch) {}
  async process(result: SearchResult, signal?: AbortSignal): Promise<RelevantDocument> {
    const response = await this.fetchImpl(result.url, { ...(signal ? { signal } : {}), headers: { "user-agent": "ShrimpPriceMonitor/0.1 (local desktop application)" } });
    if (!response.ok) throw new Error(`网页获取失败（HTTP ${response.status}）`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const mediaType = contentType.includes("pdf") || result.url.toLowerCase().endsWith(".pdf") ? "pdf" : contentType.startsWith("image/") ? "image" : "html";
    let rawText: string;
    if (mediaType === "pdf") rawText = await this.pdf.extract(bytes, this.ocr, signal);
    else if (mediaType === "image") rawText = await this.ocr.recognize(bytes, signal);
    else rawText = cleanHtml(Buffer.from(bytes).toString("utf8"));
    const relevantText = selectRelevantText(rawText);
    return { url: result.url, title: result.title, sourceName: result.sourceName, ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}), mediaType, relevantText, contentHash: sha256(bytes) };
  }
}

export function cleanHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,nav,header,footer,aside,form,iframe,svg,.ad,.ads,.advertisement,.menu,.footer,.header").remove();
  return $("article,main,.article,.content,.post").first().text().replace(/\s+/g, " ").trim() || $("body").text().replace(/\s+/g, " ").trim();
}

export function selectRelevantText(text: string, maxCharacters = 18_000): string {
  const normalized = text.replace(/([。！？；])\s*/g, "$1\n").replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  const selected = new Set<number>();
  lines.forEach((line, index) => { if (RELEVANT_LINE.test(line)) for (let offset = -1; offset <= 1; offset += 1) if (lines[index + offset]) selected.add(index + offset); });
  const output = [...selected].sort((a, b) => a - b).map((index) => lines[index]).join("\n");
  return (output || lines.join("\n")).slice(0, maxCharacters);
}
