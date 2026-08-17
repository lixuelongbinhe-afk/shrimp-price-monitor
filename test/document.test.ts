import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { cleanHtml, PdfJsProvider, selectRelevantText, TesseractOcrProvider } from "../src/providers/document-processor.js";

describe("正文清理", () => {
  it("移除菜单广告页脚，只保留正文", () => {
    const value = cleanHtml("<nav>菜单</nav><main><p>如东南美白对虾塘口价22元/斤</p><div class='ad'>广告</div></main><footer>页脚</footer>");
    expect(value).toContain("塘口价"); expect(value).not.toContain("菜单"); expect(value).not.toContain("广告");
  });
  it("相关片段选择包含报价且限制长度", () => {
    const value = selectRelevantText(`无关内容。\n如东南美白对虾40尾/斤。\n塘口价22元/斤。\n更多无关内容。`, 100);
    expect(value).toContain("塘口价"); expect(value.length).toBeLessThanOrEqual(100);
  });
  it("使用随包语言数据离线识别图片和扫描 PDF", async () => {
    const ocr = new TesseractOcrProvider();
    try {
      const imageText = await ocr.recognize(await readFile("test/fixtures/ocr-quote.png"));
      expect(imageText).toContain("2026-08-12"); expect(imageText).toContain("22 yuan/jin");
      const pdfText = await new PdfJsProvider().extract(await readFile("test/fixtures/scanned-quote.pdf"), ocr);
      expect(pdfText).toContain("RUDONG"); expect(pdfText).toContain("40 tails/jin");
    } finally { await ocr.terminate(); }
  }, 30_000);
});
