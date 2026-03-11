import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chunks, extractionTasks } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = req.nextUrl.searchParams.get("taskId");

  if (!taskId) {
    // Return chunks for the latest task
    const task = await db.query.extractionTasks.findFirst({
      where: eq(extractionTasks.documentId, id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    if (!task) {
      return NextResponse.json([]);
    }

    const chunkList = await db
      .select()
      .from(chunks)
      .where(eq(chunks.taskId, task.id))
      .orderBy(asc(chunks.chunkIndex));
    return NextResponse.json({ task, chunks: chunkList });
  }

  const task = await db.query.extractionTasks.findFirst({
    where: and(eq(extractionTasks.id, taskId), eq(extractionTasks.documentId, id)),
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const chunkList = await db
    .select()
    .from(chunks)
    .where(eq(chunks.taskId, taskId))
    .orderBy(asc(chunks.chunkIndex));

  return NextResponse.json({ task, chunks: chunkList });
}
