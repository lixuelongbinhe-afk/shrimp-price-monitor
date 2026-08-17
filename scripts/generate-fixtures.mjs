import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const fixtureDirectory = resolve("test/fixtures");
mkdirSync(fixtureDirectory, { recursive: true });
const canvas = createCanvas(1000, 300);
const context = canvas.getContext("2d");
context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
context.fillStyle = "black"; context.font = "36px sans-serif";
context.fillText("2026-08-12 RUDONG SHRIMP QUOTE", 40, 80);
context.fillText("40 tails/jin  pond-gate  22 yuan/jin", 40, 145);
context.fillText("固定 OCR 样本：如东县南美白对虾塘口价", 40, 215);
const png = canvas.toBuffer("image/png");
writeFileSync(resolve(fixtureDirectory, "ocr-quote.png"), png);
const jpeg = canvas.toBuffer("image/jpeg", 90);
writeFileSync(resolve(fixtureDirectory, "scanned-quote.pdf"), makeImagePdf(jpeg, canvas.width, canvas.height));

function makeImagePdf(image, width, height) {
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, Buffer.from("\nendstream")]),
    Buffer.from(`<< /Length 31 >>\nstream\nq ${width} 0 0 ${height} 0 0 cm /Im0 Do Q\nendstream`)
  ];
  const parts = [Buffer.from("%PDF-1.4\n")]; const offsets = [0]; let position = parts[0].length;
  objects.forEach((object, index) => { offsets.push(position); const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from("\nendobj\n")]); parts.push(part); position += part.length; });
  const xref = position; let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) table += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  parts.push(Buffer.from(`${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(parts);
}
