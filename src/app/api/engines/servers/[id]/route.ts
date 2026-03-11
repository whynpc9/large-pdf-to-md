import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineServers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const server = await db.query.engineServers.findFirst({
    where: eq(engineServers.id, id),
  });
  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  return NextResponse.json(server);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { name, baseUrl, config, isActive } = body;

  const existing = await db.query.engineServers.findFirst({
    where: eq(engineServers.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
  if (config !== undefined) updateData.config = config;
  if (isActive !== undefined) updateData.isActive = isActive;

  const [updated] = await db
    .update(engineServers)
    .set(updateData)
    .where(eq(engineServers.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(engineServers).where(eq(engineServers.id, id));
  return NextResponse.json({ success: true });
}
