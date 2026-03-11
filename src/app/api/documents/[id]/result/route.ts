import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractionTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { downloadBuffer } from "@/lib/minio";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = req.nextUrl.searchParams.get("taskId");

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

  if (!task.resultMinioPath) {
    return NextResponse.json({ error: "No result available yet" }, { status: 404 });
  }

  try {
    const buffer = await downloadBuffer(task.resultMinioPath);
    const markdown = buffer.toString("utf-8");
    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      markdown,
      errorReport: task.errorReport,
    });
  } catch {
    return NextResponse.json({ error: "Result file not found" }, { status: 404 });
  }
}
