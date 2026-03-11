import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, extractionTasks, chunks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { deletePrefix, docPath } from "@/lib/minio";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const tasks = await db.query.extractionTasks.findMany({
    where: eq(extractionTasks.documentId, id),
  });

  return NextResponse.json({ ...doc, tasks });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await db.delete(chunks).where(eq(chunks.documentId, id));
  await db.delete(extractionTasks).where(eq(extractionTasks.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));

  try {
    await deletePrefix(docPath(id));
  } catch {
    // best-effort cleanup
  }

  return NextResponse.json({ success: true });
}
