import * as Minio from "minio";
import { Readable } from "stream";

const BUCKET = process.env.MINIO_BUCKET ?? "ocr-workspace";

function createClient() {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT ?? "127.0.0.1",
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY ?? "",
    secretKey: process.env.MINIO_SECRET_KEY ?? "",
  });
}

let _client: Minio.Client | null = null;
function getClient() {
  if (!_client) _client = createClient();
  return _client;
}

let _bucketChecked = false;
export async function ensureBucket() {
  if (_bucketChecked) return;
  const client = getClient();
  try {
    const exists = await client.bucketExists(BUCKET);
    if (!exists) {
      await client.makeBucket(BUCKET, "us-east-1");
    }
    _bucketChecked = true;
  } catch (err) {
    console.error("MinIO bucket check failed:", err);
    throw err;
  }
}

export function docPath(documentId: string) {
  return `documents/${documentId}`;
}

export function originalPdfPath(documentId: string) {
  return `${docPath(documentId)}/original.pdf`;
}

export function chunkPdfPath(documentId: string, chunkIndex: number) {
  return `${docPath(documentId)}/chunks/chunk_${String(chunkIndex).padStart(3, "0")}.pdf`;
}

export function pagePngPath(documentId: string, pageIndex: number) {
  return `${docPath(documentId)}/pages/page_${String(pageIndex).padStart(3, "0")}.png`;
}

export function chunkResultPath(documentId: string, chunkIndex: number) {
  return `${docPath(documentId)}/results/chunk_${String(chunkIndex).padStart(3, "0")}.md`;
}

export function mergedResultPath(documentId: string) {
  return `${docPath(documentId)}/results/merged.md`;
}

export async function uploadBuffer(path: string, buffer: Buffer, contentType?: string) {
  const client = getClient();
  await ensureBucket();
  const metadata: Record<string, string> = {};
  if (contentType) metadata["Content-Type"] = contentType;
  await client.putObject(BUCKET, path, buffer, buffer.length, metadata);
}

export async function uploadStream(path: string, stream: Readable, size: number, contentType?: string) {
  const client = getClient();
  await ensureBucket();
  const metadata: Record<string, string> = {};
  if (contentType) metadata["Content-Type"] = contentType;
  await client.putObject(BUCKET, path, stream, size, metadata);
}

export async function downloadBuffer(path: string): Promise<Buffer> {
  const client = getClient();
  const stream = await client.getObject(BUCKET, path);
  const bufs: Buffer[] = [];
  for await (const chunk of stream) {
    bufs.push(Buffer.from(chunk));
  }
  return Buffer.concat(bufs);
}

export async function getPresignedUrl(path: string, expirySeconds = 3600): Promise<string> {
  const client = getClient();
  return client.presignedGetObject(BUCKET, path, expirySeconds);
}

export async function deleteObject(path: string) {
  const client = getClient();
  await client.removeObject(BUCKET, path);
}

export async function deletePrefix(prefix: string) {
  const client = getClient();
  const objects: string[] = [];
  const stream = client.listObjectsV2(BUCKET, prefix, true);
  for await (const obj of stream) {
    if (obj.name) objects.push(obj.name);
  }
  if (objects.length > 0) {
    await client.removeObjects(BUCKET, objects);
  }
}

export async function listObjects(prefix: string): Promise<string[]> {
  const client = getClient();
  const objects: string[] = [];
  const stream = client.listObjectsV2(BUCKET, prefix, true);
  for await (const obj of stream) {
    if (obj.name) objects.push(obj.name);
  }
  return objects;
}

export { BUCKET };
