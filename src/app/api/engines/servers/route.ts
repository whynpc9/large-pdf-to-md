import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { engineServers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const engineType = req.nextUrl.searchParams.get("engineType");

  let servers;
  if (engineType) {
    servers = await db
      .select()
      .from(engineServers)
      .where(eq(engineServers.engineType, engineType))
      .orderBy(desc(engineServers.createdAt));
  } else {
    servers = await db
      .select()
      .from(engineServers)
      .orderBy(desc(engineServers.createdAt));
  }

  return NextResponse.json(servers);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { engineType, name, baseUrl, config } = body;

  if (!engineType || !name || !baseUrl) {
    return NextResponse.json(
      { error: "engineType, name, and baseUrl are required" },
      { status: 400 }
    );
  }

  if (!["mineru", "vlm"].includes(engineType)) {
    return NextResponse.json(
      { error: "engineType must be 'mineru' or 'vlm'" },
      { status: 400 }
    );
  }

  const [server] = await db
    .insert(engineServers)
    .values({
      engineType,
      name,
      baseUrl,
      config: config ?? {},
      isActive: true,
    })
    .returning();

  return NextResponse.json(server, { status: 201 });
}
