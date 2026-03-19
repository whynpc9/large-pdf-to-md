import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3300";
const ASSET_PATH =
  process.env.PDF_PATH ??
  path.resolve(process.cwd(), "assets", "ocr测试单页.pdf");

async function main() {
  console.log(`[e2e] using base URL: ${BASE_URL}`);
  console.log(`[e2e] using PDF: ${ASSET_PATH}`);

  await waitForApp();

  const server = await createServer();
  console.log(`[e2e] created engine server: ${server.id}`);

  const document = await uploadDocument();
  console.log(`[e2e] uploaded document: ${document.id}`);

  const task = await startExtraction(document.id, server.id);
  console.log(`[e2e] started extraction task: ${task.id}`);

  const chunksState = await waitForCompletion(document.id, task.id);
  console.log(`[e2e] task finished with status: ${chunksState.task.status}`);

  const result = await fetchJson(
    `${BASE_URL}/api/documents/${document.id}/result?taskId=${task.id}`
  );

  if (!result.markdown || result.markdown.trim().length < 20) {
    throw new Error("markdown result is unexpectedly short");
  }

  console.log("[e2e] markdown preview:");
  console.log(result.markdown.slice(0, 200));
}

async function waitForApp() {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) return;
    } catch {
      // keep polling
    }
    await sleep(2_000);
  }

  throw new Error(`app did not become ready within timeout: ${BASE_URL}`);
}

async function createServer() {
  return postJson(`${BASE_URL}/api/engines/servers`, {
    engineType: "opendataloader",
    name: "OpenDataLoader Local E2E",
    baseUrl: "",
    config: {
      command: "opendataloader-pdf",
      hybrid: "off",
      hybridMode: "auto",
      useStructTree: false,
      keepLineBreaks: false,
      hybridTimeoutMs: 30000,
      hybridFallback: false,
      maxRetries: 1,
    },
  });
}

async function uploadDocument() {
  const pdfBuffer = await fs.readFile(ASSET_PATH);
  const formData = new FormData();
  formData.set(
    "file",
    new File([pdfBuffer], path.basename(ASSET_PATH), {
      type: "application/pdf",
    })
  );
  formData.set("name", path.basename(ASSET_PATH, ".pdf"));

  const res = await fetch(`${BASE_URL}/api/documents`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  return parseJsonResponse(res);
}

async function startExtraction(documentId, serverId) {
  return postJson(`${BASE_URL}/api/documents/${documentId}/extract`, {
    engineType: "opendataloader",
    serverId,
    config: {
      command: "opendataloader-pdf",
      hybrid: "off",
      hybridMode: "auto",
      maxRetries: 1,
    },
  });
}

async function waitForCompletion(documentId, taskId) {
  const deadline = Date.now() + 300_000;

  while (Date.now() < deadline) {
    const state = await fetchJson(
      `${BASE_URL}/api/documents/${documentId}/chunks?taskId=${taskId}`
    );
    const status = state.task?.status;

    if (status === "completed" || status === "partial") {
      return state;
    }

    if (status === "failed") {
      throw new Error(`extraction failed: ${state.task?.errorReport ?? "unknown error"}`);
    }

    await sleep(3_000);
  }

  throw new Error(`task did not finish within timeout: ${taskId}`);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  return parseJsonResponse(res);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  });

  return parseJsonResponse(res);
}

async function parseJsonResponse(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }

  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[e2e] failed:", error);
  process.exit(1);
});
