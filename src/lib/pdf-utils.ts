import { PDFDocument } from "pdf-lib";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

export async function getPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  return doc.getPageCount();
}

export interface PdfChunk {
  index: number;
  startPage: number;
  endPage: number;
  buffer: Buffer;
}

export async function splitPdf(
  pdfBuffer: Buffer,
  pagesPerChunk: number
): Promise<PdfChunk[]> {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();
  const chunks: PdfChunk[] = [];

  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(
      srcDoc,
      Array.from({ length: end - start }, (_, i) => start + i)
    );
    pages.forEach((p) => newDoc.addPage(p));
    const bytes = await newDoc.save();

    chunks.push({
      index: chunks.length,
      startPage: start,
      endPage: end - 1,
      buffer: Buffer.from(bytes),
    });
  }

  return chunks;
}

export async function pdfPageToImage(
  pdfBuffer: Buffer,
  pageIndex: number,
  dpi: number = 150
): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf2img-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    await fs.writeFile(pdfPath, pdfBuffer);

    const pageNum = pageIndex + 1;
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      String(Math.min(dpi, 200)),
      "-f",
      String(pageNum),
      "-l",
      String(pageNum),
      "-singlefile",
      pdfPath,
      outputPrefix,
    ]);

    const pngPath = `${outputPrefix}.png`;
    return await fs.readFile(pngPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function pdfPagesToImages(
  pdfBuffer: Buffer,
  startPage: number,
  endPage: number,
  dpi: number = 150
): Promise<{ pageIndex: number; buffer: Buffer }[]> {
  const results: { pageIndex: number; buffer: Buffer }[] = [];
  for (let i = startPage; i <= endPage; i++) {
    const buffer = await pdfPageToImage(pdfBuffer, i, dpi);
    results.push({ pageIndex: i, buffer });
  }
  return results;
}
