import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { extractionTasks, chunks, documents, engineServers } from "@/lib/db/schema";
import type { ExtractionTask, Chunk, EngineServer } from "@/lib/db/schema";
import {
  downloadBuffer,
  uploadBuffer,
  chunkPdfPath,
  pagePngPath,
  chunkResultPath,
  mergedResultPath,
  getPresignedUrl,
} from "@/lib/minio";
import { splitPdf, getPageCount, pdfPagesToImages } from "@/lib/pdf-utils";
import { extractWithMinerU } from "@/lib/engines/mineru";
import { extractWithOpenDataLoader } from "@/lib/engines/opendataloader";
import { extractWithVLM } from "@/lib/engines/vlm";
import {
  getMinerUConfig,
  getOpenDataLoaderConfig,
  getVLMConfig,
} from "@/lib/engines/types";

export async function runExtraction(taskId: string) {
  try {
    const task = await db.query.extractionTasks.findFirst({
      where: eq(extractionTasks.id, taskId),
    });
    if (!task) throw new Error(`Task ${taskId} not found`);

    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, task.documentId),
    });
    if (!doc) throw new Error(`Document ${task.documentId} not found`);

    const server = await db.query.engineServers.findFirst({
      where: eq(engineServers.id, task.serverId),
    });
    if (!server) throw new Error(`Server ${task.serverId} not found`);

    await db
      .update(extractionTasks)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(extractionTasks.id, taskId));

    await db
      .update(documents)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(documents.id, doc.id));

    const pdfBuffer = await downloadBuffer(doc.minioPath);
    const pageCount = await getPageCount(pdfBuffer);

    await db
      .update(documents)
      .set({ pageCount, updatedAt: new Date() })
      .where(eq(documents.id, doc.id));

    if (task.engineType === "mineru") {
      await runMinerUPipeline(task, doc.id, pdfBuffer, pageCount, server);
    } else if (task.engineType === "opendataloader") {
      await runOpenDataLoaderPipeline(task, doc.id, pdfBuffer, pageCount, server);
    } else {
      await runVLMPipeline(task, doc.id, pdfBuffer, pageCount, server);
    }

    await mergeResults(taskId, doc.id);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Extraction task ${taskId} failed:`, msg);
    await db
      .update(extractionTasks)
      .set({ status: "failed", errorReport: msg, updatedAt: new Date() })
      .where(eq(extractionTasks.id, taskId));
  }
}

async function runMinerUPipeline(
  task: ExtractionTask,
  documentId: string,
  pdfBuffer: Buffer,
  pageCount: number,
  server: EngineServer
) {
  const config = getMinerUConfig({
    ...((server.config ?? {}) as Record<string, unknown>),
    ...((task.config ?? {}) as Record<string, unknown>),
  });

  const pdfChunks = await splitPdf(pdfBuffer, config.pagesPerChunk);

  await db
    .update(extractionTasks)
    .set({ totalChunks: pdfChunks.length, updatedAt: new Date() })
    .where(eq(extractionTasks.id, task.id));

  const chunkRecords: Chunk[] = [];
  for (const chunk of pdfChunks) {
    const inputPath = chunkPdfPath(documentId, chunk.index);
    await uploadBuffer(inputPath, chunk.buffer, "application/pdf");

    const [record] = await db
      .insert(chunks)
      .values({
        taskId: task.id,
        documentId,
        chunkIndex: chunk.index,
        startPage: chunk.startPage,
        endPage: chunk.endPage,
        minioInputPath: inputPath,
        status: "pending",
      })
      .returning();
    chunkRecords.push(record);
  }

  for (const chunkRecord of chunkRecords) {
    await processChunkWithRetry(
      chunkRecord,
      config.maxRetries,
      async (c: Chunk) => {
        const chunkBuffer = await downloadBuffer(c.minioInputPath!);
        const filename = `chunk_${String(c.chunkIndex).padStart(3, "0")}.pdf`;
        return extractWithMinerU(server.baseUrl, chunkBuffer, filename, config);
      }
    );
  }
}

async function runVLMPipeline(
  task: ExtractionTask,
  documentId: string,
  pdfBuffer: Buffer,
  pageCount: number,
  server: EngineServer
) {
  const config = getVLMConfig({
    ...((server.config ?? {}) as Record<string, unknown>),
    ...((task.config ?? {}) as Record<string, unknown>),
  });

  const batchSize = Math.max(1, config.pagesPerBatch);
  const numChunks = Math.ceil(pageCount / batchSize);

  await db
    .update(extractionTasks)
    .set({ totalChunks: numChunks, updatedAt: new Date() })
    .where(eq(extractionTasks.id, task.id));

  const chunkRecords: Chunk[] = [];
  for (let i = 0; i < numChunks; i++) {
    const startPage = i * batchSize;
    const endPage = Math.min(startPage + batchSize - 1, pageCount - 1);
    const [record] = await db
      .insert(chunks)
      .values({
        taskId: task.id,
        documentId,
        chunkIndex: i,
        startPage,
        endPage,
        status: "pending",
      })
      .returning();
    chunkRecords.push(record);
  }

  for (const chunkRecord of chunkRecords) {
    await processChunkWithRetry(
      chunkRecord,
      config.maxRetries,
      async (c: Chunk) => {
        const images = await pdfPagesToImages(
          pdfBuffer,
          c.startPage,
          c.endPage,
          config.dpi
        );

        const imageUrls: string[] = [];
        for (const img of images) {
          const imgPath = pagePngPath(documentId, img.pageIndex);
          await uploadBuffer(imgPath, img.buffer, "image/png");
          const url = await getPresignedUrl(imgPath, 3600);
          imageUrls.push(url);
        }

        return extractWithVLM(server.baseUrl, imageUrls, config);
      }
    );
  }
}

async function runOpenDataLoaderPipeline(
  task: ExtractionTask,
  documentId: string,
  pdfBuffer: Buffer,
  pageCount: number,
  server: EngineServer
) {
  const config = getOpenDataLoaderConfig({
    ...((server.config ?? {}) as Record<string, unknown>),
    ...((task.config ?? {}) as Record<string, unknown>),
  });

  await db
    .update(extractionTasks)
    .set({ totalChunks: 1, updatedAt: new Date() })
    .where(eq(extractionTasks.id, task.id));

  const inputPath = chunkPdfPath(documentId, 0);
  await uploadBuffer(inputPath, pdfBuffer, "application/pdf");

  const [chunkRecord] = await db
    .insert(chunks)
    .values({
      taskId: task.id,
      documentId,
      chunkIndex: 0,
      startPage: 0,
      endPage: Math.max(0, pageCount - 1),
      minioInputPath: inputPath,
      status: "pending",
    })
    .returning();

  await processChunkWithRetry(chunkRecord, config.maxRetries, async (c: Chunk) => {
    const chunkBuffer = await downloadBuffer(c.minioInputPath!);
    const filename = `document_${documentId}.pdf`;
    return extractWithOpenDataLoader(server.baseUrl, chunkBuffer, filename, config);
  });
}

async function processChunkWithRetry(
  chunkRecord: Chunk,
  maxRetries: number,
  processFn: (chunk: Chunk) => Promise<string>
) {
  const taskId = chunkRecord.taskId;

  await db
    .update(chunks)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(chunks.id, chunkRecord.id));

  let lastError = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const markdown = await processFn(chunkRecord);

      const resultPath = chunkResultPath(chunkRecord.documentId, chunkRecord.chunkIndex);
      await uploadBuffer(resultPath, Buffer.from(markdown, "utf-8"), "text/markdown");

      await db
        .update(chunks)
        .set({
          status: "completed",
          resultMd: markdown,
          minioResultPath: resultPath,
          retryCount: attempt,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(chunks.id, chunkRecord.id));

      await db
        .update(extractionTasks)
        .set({
          completedChunks: (
            await db.query.chunks.findMany({
              where: and(eq(chunks.taskId, taskId), eq(chunks.status, "completed")),
            })
          ).length,
          updatedAt: new Date(),
        })
        .where(eq(extractionTasks.id, taskId));

      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(
        `Chunk ${chunkRecord.chunkIndex} attempt ${attempt + 1} failed:`,
        lastError
      );

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  await db
    .update(chunks)
    .set({
      status: "failed",
      errorMessage: lastError,
      retryCount: maxRetries,
      updatedAt: new Date(),
    })
    .where(eq(chunks.id, chunkRecord.id));

  await db
    .update(extractionTasks)
    .set({
      failedChunks: (
        await db.query.chunks.findMany({
          where: and(eq(chunks.taskId, taskId), eq(chunks.status, "failed")),
        })
      ).length,
      updatedAt: new Date(),
    })
    .where(eq(extractionTasks.id, taskId));
}

async function mergeResults(taskId: string, documentId: string) {
  const allChunks = await db.query.chunks.findMany({
    where: eq(chunks.taskId, taskId),
  });

  allChunks.sort((a, b) => a.startPage - b.startPage);

  const completedChunks = allChunks.filter((c) => c.status === "completed");
  const failedChunks = allChunks.filter((c) => c.status === "failed");

  const mergedMd = completedChunks
    .map((c) => c.resultMd ?? "")
    .filter(Boolean)
    .join("\n\n");

  const resultPath = mergedResultPath(documentId);
  await uploadBuffer(resultPath, Buffer.from(mergedMd, "utf-8"), "text/markdown");

  let errorReport: string | null = null;
  if (failedChunks.length > 0) {
    errorReport = failedChunks
      .map(
        (c) =>
          `Chunk ${c.chunkIndex} (pages ${c.startPage}-${c.endPage}): ${c.errorMessage}`
      )
      .join("\n");
  }

  const finalStatus = failedChunks.length > 0 ? "partial" : "completed";

  await db
    .update(extractionTasks)
    .set({
      status: finalStatus,
      completedChunks: completedChunks.length,
      failedChunks: failedChunks.length,
      errorReport,
      resultMinioPath: resultPath,
      updatedAt: new Date(),
    })
    .where(eq(extractionTasks.id, taskId));

  const docStatus = failedChunks.length > 0 ? "partial" : "completed";
  await db
    .update(documents)
    .set({ status: docStatus, updatedAt: new Date() })
    .where(eq(documents.id, documentId));
}

export async function retryFailedChunks(taskId: string, newPagesPerChunk?: number) {
  console.log(`[retry] called with taskId=${taskId}, newPagesPerChunk=${newPagesPerChunk}`);

  const task = await db.query.extractionTasks.findFirst({
    where: eq(extractionTasks.id, taskId),
  });
  if (!task) throw new Error(`Task ${taskId} not found`);

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, task.documentId),
  });
  if (!doc) throw new Error(`Document not found`);

  const server = await db.query.engineServers.findFirst({
    where: eq(engineServers.id, task.serverId),
  });
  if (!server) throw new Error(`Server not found`);

  const failedChunkRecords = await db.query.chunks.findMany({
    where: and(eq(chunks.taskId, taskId), eq(chunks.status, "failed")),
  });

  console.log(`[retry] found ${failedChunkRecords.length} failed chunks`);
  if (failedChunkRecords.length === 0) return;

  await db
    .update(extractionTasks)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(extractionTasks.id, taskId));

  await db
    .update(documents)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(documents.id, doc.id));

  const pdfBuffer = await downloadBuffer(doc.minioPath);

  const allChunksForTask = await db.query.chunks.findMany({
    where: eq(chunks.taskId, taskId),
  });
  let nextChunkIndex = Math.max(...allChunksForTask.map((c) => c.chunkIndex)) + 1;

  for (const chunkRecord of failedChunkRecords) {
    const chunkPageCount = chunkRecord.endPage - chunkRecord.startPage + 1;
    const effectivePagesPerChunk = newPagesPerChunk ?? chunkPageCount;
    const needsResplit = effectivePagesPerChunk < chunkPageCount;
    console.log(
      `[retry] chunk #${chunkRecord.chunkIndex} pages ${chunkRecord.startPage}-${chunkRecord.endPage}` +
      ` (${chunkPageCount} pages), effectivePagesPerChunk=${effectivePagesPerChunk}, needsResplit=${needsResplit}`
    );

    if (needsResplit && task.engineType === "mineru") {
      await db.delete(chunks).where(eq(chunks.id, chunkRecord.id));

      const subChunkDefs: { startPage: number; endPage: number }[] = [];
      for (let p = chunkRecord.startPage; p <= chunkRecord.endPage; p += effectivePagesPerChunk) {
        subChunkDefs.push({
          startPage: p,
          endPage: Math.min(p + effectivePagesPerChunk - 1, chunkRecord.endPage),
        });
      }
      console.log(
        `[retry] resplitting chunk #${chunkRecord.chunkIndex} into ${subChunkDefs.length} sub-chunks:`,
        subChunkDefs.map((s) => `${s.startPage}-${s.endPage}`).join(", ")
      );

      const config = getMinerUConfig({
        ...((server.config ?? {}) as Record<string, unknown>),
        ...((task.config ?? {}) as Record<string, unknown>),
        pagesPerChunk: effectivePagesPerChunk,
      });

      for (const sub of subChunkDefs) {
        const subPageCount = sub.endPage - sub.startPage + 1;
        console.log(`[retry] creating sub-chunk pages ${sub.startPage}-${sub.endPage} (${subPageCount} pages)`);
        const subDoc = await import("pdf-lib").then((m) => m.PDFDocument.create());
        const srcDoc = await import("pdf-lib").then((m) =>
          m.PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
        );
        const pageIndices = Array.from({ length: subPageCount }, (_, i) => sub.startPage + i);
        const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((p) => subDoc.addPage(p));
        const subBuffer = Buffer.from(await subDoc.save());

        const idx = nextChunkIndex++;
        const inputPath = chunkPdfPath(doc.id, idx);
        await uploadBuffer(inputPath, subBuffer, "application/pdf");

        const [newChunk] = await db
          .insert(chunks)
          .values({
            taskId,
            documentId: doc.id,
            chunkIndex: idx,
            startPage: sub.startPage,
            endPage: sub.endPage,
            minioInputPath: inputPath,
            status: "pending",
          })
          .returning();

        console.log(`[retry] processing sub-chunk #${idx} pages ${sub.startPage}-${sub.endPage}`);
        await processChunkWithRetry(newChunk, config.maxRetries, async (c) => {
          const buf = await downloadBuffer(c.minioInputPath!);
          const filename = `chunk_${String(c.chunkIndex).padStart(3, "0")}.pdf`;
          return extractWithMinerU(server.baseUrl, buf, filename, config);
        });
      }
    } else if (needsResplit && task.engineType === "vlm") {
      await db.delete(chunks).where(eq(chunks.id, chunkRecord.id));

      const config = getVLMConfig({
        ...((server.config ?? {}) as Record<string, unknown>),
        ...((task.config ?? {}) as Record<string, unknown>),
        pagesPerBatch: effectivePagesPerChunk,
      });

      const subChunkDefs: { startPage: number; endPage: number }[] = [];
      for (let p = chunkRecord.startPage; p <= chunkRecord.endPage; p += effectivePagesPerChunk) {
        subChunkDefs.push({
          startPage: p,
          endPage: Math.min(p + effectivePagesPerChunk - 1, chunkRecord.endPage),
        });
      }

      for (const sub of subChunkDefs) {
        const idx = nextChunkIndex++;
        const [newChunk] = await db
          .insert(chunks)
          .values({
            taskId,
            documentId: doc.id,
            chunkIndex: idx,
            startPage: sub.startPage,
            endPage: sub.endPage,
            status: "pending",
          })
          .returning();

        await processChunkWithRetry(newChunk, config.maxRetries, async (c) => {
          const images = await pdfPagesToImages(pdfBuffer, c.startPage, c.endPage, config.dpi);
          const imageUrls: string[] = [];
          for (const img of images) {
            const imgPath = pagePngPath(doc.id, img.pageIndex);
            await uploadBuffer(imgPath, img.buffer, "image/png");
            const url = await getPresignedUrl(imgPath, 3600);
            imageUrls.push(url);
          }
          return extractWithVLM(server.baseUrl, imageUrls, config);
        });
      }
    } else {
      console.log(`[retry] retrying chunk #${chunkRecord.chunkIndex} as-is (no resplit)`);
      await db
        .update(chunks)
        .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
        .where(eq(chunks.id, chunkRecord.id));

      if (task.engineType === "mineru") {
        const config = getMinerUConfig({
          ...((server.config ?? {}) as Record<string, unknown>),
          ...((task.config ?? {}) as Record<string, unknown>),
        });
        await processChunkWithRetry(chunkRecord, config.maxRetries, async (c) => {
          const chunkBuffer = await downloadBuffer(c.minioInputPath!);
          const filename = `chunk_${String(c.chunkIndex).padStart(3, "0")}.pdf`;
          return extractWithMinerU(server.baseUrl, chunkBuffer, filename, config);
        });
      } else if (task.engineType === "opendataloader") {
        const config = getOpenDataLoaderConfig({
          ...((server.config ?? {}) as Record<string, unknown>),
          ...((task.config ?? {}) as Record<string, unknown>),
        });
        await processChunkWithRetry(chunkRecord, config.maxRetries, async (c) => {
          const chunkBuffer = await downloadBuffer(c.minioInputPath!);
          const filename = `document_${doc.id}.pdf`;
          return extractWithOpenDataLoader(server.baseUrl, chunkBuffer, filename, config);
        });
      } else {
        const config = getVLMConfig({
          ...((server.config ?? {}) as Record<string, unknown>),
          ...((task.config ?? {}) as Record<string, unknown>),
        });
        await processChunkWithRetry(chunkRecord, config.maxRetries, async (c) => {
          const images = await pdfPagesToImages(pdfBuffer, c.startPage, c.endPage, config.dpi);
          const imageUrls: string[] = [];
          for (const img of images) {
            const imgPath = pagePngPath(doc.id, img.pageIndex);
            await uploadBuffer(imgPath, img.buffer, "image/png");
            const url = await getPresignedUrl(imgPath, 3600);
            imageUrls.push(url);
          }
          return extractWithVLM(server.baseUrl, imageUrls, config);
        });
      }
    }
  }

  const updatedAllChunks = await db.query.chunks.findMany({
    where: eq(chunks.taskId, taskId),
  });
  await db
    .update(extractionTasks)
    .set({ totalChunks: updatedAllChunks.length, updatedAt: new Date() })
    .where(eq(extractionTasks.id, taskId));

  await mergeResults(taskId, doc.id);
}
