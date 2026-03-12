import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractionTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { retryFailedChunks } from "@/lib/extraction/pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const taskId = body.taskId as string | undefined;
  const pagesPerChunk = body.pagesPerChunk as number | undefined;
  console.log(`[retry-api] received retry request: taskId=${taskId}, pagesPerChunk=${pagesPerChunk}`);

  let task;
  if (taskId) {
    task = await db.query.extractionTasks.findFirst({
      where: eq(extractionTasks.id, taskId),
    });
  } else {
    task = await db.query.extractionTasks.findFirst({
      where: eq(extractionTasks.documentId, id),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
  }

  if (!task) {
    return NextResponse.json({ error: "No extraction task found" }, { status: 404 });
  }

  retryFailedChunks(task.id, pagesPerChunk).catch((err) =>
    console.error("Background retry failed:", err)
  );

  return NextResponse.json({ taskId: task.id, status: "retrying" });
}
