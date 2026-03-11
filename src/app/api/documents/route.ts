import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { uploadBuffer, originalPdfPath } from "@/lib/minio";
import { getPageCount } from "@/lib/pdf-utils";

export async function GET() {
  const docs = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt));
  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string) || "";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const documentId = crypto.randomUUID();
  const minioPath = originalPdfPath(documentId);

  await uploadBuffer(minioPath, buffer, "application/pdf");

  let pageCount: number | null = null;
  try {
    pageCount = await getPageCount(buffer);
  } catch {
    // page count will be determined during extraction
  }

  const [doc] = await db
    .insert(documents)
    .values({
      id: documentId,
      name: name || file.name.replace(/\.pdf$/i, ""),
      originalFilename: file.name,
      fileSize: buffer.length,
      pageCount,
      minioPath,
      status: "uploaded",
    })
    .returning();

  return NextResponse.json(doc, { status: 201 });
}
