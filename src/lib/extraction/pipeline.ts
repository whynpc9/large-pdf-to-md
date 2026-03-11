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
import { extractWithVLM } from "@/lib/engines/vlm";
import { getMinerUConfig, getVLMConfig } from "@/lib/engines/types";

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

  allChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

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

export async function retryFailedChunks(taskId: string) {
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

  for (const chunkRecord of failedChunkRecords) {
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
    } else {
      const config = getVLMConfig({
        ...((server.config ?? {}) as Record<string, unknown>),
        ...((task.config ?? {}) as Record<string, unknown>),
      });
      await processChunkWithRetry(chunkRecord, config.maxRetries, async (c) => {
        const images = await pdfPagesToImages(
          pdfBuffer,
          c.startPage,
          c.endPage,
          config.dpi
        );
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

  await mergeResults(taskId, doc.id);
}
