import { test, expect, type APIRequestContext } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const ASSETS_DIR = path.resolve(__dirname, "../../assets");
const BASE_URL = "http://localhost:3000";

const MINERU_SERVER_URL = "http://your-mineru-host:8523";
const VLM_SERVER_URL = "http://your-vllm-host:8101";

async function createServer(
  request: APIRequestContext,
  engineType: string,
  name: string,
  baseUrl: string,
  config: Record<string, unknown>
) {
  const res = await request.post(`${BASE_URL}/api/engines/servers`, {
    data: { engineType, name, baseUrl, config },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function uploadDocument(request: APIRequestContext, filename: string) {
  const filePath = path.join(ASSETS_DIR, filename);
  expect(fs.existsSync(filePath)).toBeTruthy();

  const res = await request.post(`${BASE_URL}/api/documents`, {
    multipart: {
      file: {
        name: filename,
        mimeType: "application/pdf",
        buffer: fs.readFileSync(filePath),
      },
      name: filename.replace(/\.pdf$/i, ""),
    },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function startExtraction(
  request: APIRequestContext,
  documentId: string,
  engineType: string,
  serverId: string,
  config: Record<string, unknown> = {}
) {
  const res = await request.post(`${BASE_URL}/api/documents/${documentId}/extract`, {
    data: { engineType, serverId, config },
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function waitForCompletion(
  request: APIRequestContext,
  documentId: string,
  taskId: string,
  timeoutMs: number = 240_000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`${BASE_URL}/api/documents/${documentId}/chunks?taskId=${taskId}`);
    const data = await res.json();
    const status = data.task?.status;

    if (status === "completed" || status === "partial") {
      return data;
    }
    if (status === "failed") {
      throw new Error(`Extraction failed: ${data.task?.errorReport ?? "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Extraction timed out");
}

async function getResult(request: APIRequestContext, documentId: string, taskId: string) {
  const res = await request.get(`${BASE_URL}/api/documents/${documentId}/result?taskId=${taskId}`);
  expect(res.ok()).toBeTruthy();
  return res.json();
}

test.describe("PDF Extraction E2E", () => {
  let mineruServerId: string;
  let vlmServerId: string;

  test.beforeAll(async ({ request }) => {
    const mineruServer = await createServer(request, "mineru", "MinerU 测试服务器", MINERU_SERVER_URL, {
      backend: "pipeline",
      pagesPerChunk: 5,
      maxRetries: 2,
      lang: "ch",
    });
    mineruServerId = mineruServer.id;

    const vlmServer = await createServer(request, "vlm", "VLM 测试服务器", VLM_SERVER_URL, {
      modelId: "Qwen/Qwen3-VL-4B-Instruct",
      dpi: 150,
      pagesPerBatch: 1,
      maxRetries: 2,
    });
    vlmServerId = vlmServer.id;
  });

  test("MinerU extraction - single page PDF", async ({ request }) => {
    const doc = await uploadDocument(request, "ocr测试单页.pdf");
    expect(doc.id).toBeTruthy();
    expect(doc.status).toBe("uploaded");

    const task = await startExtraction(request, doc.id, "mineru", mineruServerId, {
      pagesPerChunk: 5,
    });
    expect(task.id).toBeTruthy();

    await waitForCompletion(request, doc.id, task.id);

    const result = await getResult(request, doc.id, task.id);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(10);
    console.log(`MinerU single page result (first 200 chars): ${result.markdown.substring(0, 200)}`);
  });

  test("MinerU extraction - 10 page PDF", async ({ request }) => {
    const doc = await uploadDocument(request, "ocr测试10页.pdf");
    expect(doc.id).toBeTruthy();

    const task = await startExtraction(request, doc.id, "mineru", mineruServerId, {
      pagesPerChunk: 5,
    });

    const data = await waitForCompletion(request, doc.id, task.id);
    expect(data.task.totalChunks).toBeGreaterThanOrEqual(2);

    const result = await getResult(request, doc.id, task.id);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(50);
    console.log(`MinerU 10 page result (first 200 chars): ${result.markdown.substring(0, 200)}`);
  });

  test("VLM extraction - single page PDF", async ({ request }) => {
    const doc = await uploadDocument(request, "ocr测试单页.pdf");
    expect(doc.id).toBeTruthy();

    const task = await startExtraction(request, doc.id, "vlm", vlmServerId, {
      dpi: 150,
      pagesPerBatch: 1,
    });

    await waitForCompletion(request, doc.id, task.id);

    const result = await getResult(request, doc.id, task.id);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(10);
    console.log(`VLM single page result (first 200 chars): ${result.markdown.substring(0, 200)}`);
  });

  test("VLM extraction - 10 page PDF", async ({ request }) => {
    const doc = await uploadDocument(request, "ocr测试10页.pdf");
    expect(doc.id).toBeTruthy();

    const task = await startExtraction(request, doc.id, "vlm", vlmServerId, {
      dpi: 150,
      pagesPerBatch: 1,
    });

    const data = await waitForCompletion(request, doc.id, task.id);
    expect(data.task.totalChunks).toBeGreaterThanOrEqual(10);

    const result = await getResult(request, doc.id, task.id);
    expect(result.markdown).toBeTruthy();
    expect(result.markdown.length).toBeGreaterThan(50);
    console.log(`VLM 10 page result (first 200 chars): ${result.markdown.substring(0, 200)}`);
  });

  test("Document management - upload, list, delete", async ({ request }) => {
    const doc = await uploadDocument(request, "ocr测试单页.pdf");
    expect(doc.id).toBeTruthy();

    const listRes = await request.get(`${BASE_URL}/api/documents`);
    const list = await listRes.json();
    expect(list.some((d: { id: string }) => d.id === doc.id)).toBeTruthy();

    const detailRes = await request.get(`${BASE_URL}/api/documents/${doc.id}`);
    const detail = await detailRes.json();
    expect(detail.name).toBeTruthy();

    const deleteRes = await request.delete(`${BASE_URL}/api/documents/${doc.id}`);
    expect(deleteRes.ok()).toBeTruthy();

    const afterDeleteRes = await request.get(`${BASE_URL}/api/documents/${doc.id}`);
    expect(afterDeleteRes.status()).toBe(404);
  });

  test("Engine server management - CRUD", async ({ request }) => {
    const server = await createServer(request, "mineru", "E2E Test Server", "http://localhost:9999", {
      backend: "pipeline",
      pagesPerChunk: 10,
    });
    expect(server.id).toBeTruthy();

    const updateRes = await request.put(`${BASE_URL}/api/engines/servers/${server.id}`, {
      data: { name: "Updated Server", config: { backend: "pipeline", pagesPerChunk: 25 } },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.name).toBe("Updated Server");

    const deleteRes = await request.delete(`${BASE_URL}/api/engines/servers/${server.id}`);
    expect(deleteRes.ok()).toBeTruthy();
  });
});
