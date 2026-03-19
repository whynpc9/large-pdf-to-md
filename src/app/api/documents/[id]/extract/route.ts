import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documents, extractionTasks, engineServers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runExtraction } from "@/lib/extraction/pipeline";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { engineType, serverId, config } = body;

  if (!engineType || !serverId) {
    return NextResponse.json(
      { error: "engineType and serverId are required" },
      { status: 400 }
    );
  }

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const server = await db.query.engineServers.findFirst({
    where: eq(engineServers.id, serverId),
  });
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  if (server.engineType !== engineType) {
    return NextResponse.json(
      { error: "Server engineType does not match request engineType" },
      { status: 400 }
    );
  }

  const [task] = await db
    .insert(extractionTasks)
    .values({
      documentId: id,
      engineType,
      serverId,
      status: "pending",
      config: config ?? {},
    })
    .returning();

  // Fire and forget -- the pipeline updates DB as it progresses
  runExtraction(task.id).catch((err) =>
    console.error("Background extraction failed:", err)
  );

  return NextResponse.json(task, { status: 201 });
}
