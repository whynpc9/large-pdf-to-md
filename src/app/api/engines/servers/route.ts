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

  const normalizedBaseUrl = typeof baseUrl === "string" ? baseUrl.trim() : "";
  const requiresBaseUrl = engineType !== "opendataloader";

  if (!engineType || !name || (requiresBaseUrl && !normalizedBaseUrl)) {
    return NextResponse.json(
      { error: "engineType and name are required; baseUrl is required for remote engines" },
      { status: 400 }
    );
  }

  if (!["mineru", "vlm", "opendataloader"].includes(engineType)) {
    return NextResponse.json(
      { error: "engineType must be 'mineru', 'vlm', or 'opendataloader'" },
      { status: 400 }
    );
  }

  const [server] = await db
    .insert(engineServers)
    .values({
      engineType,
      name,
      baseUrl: normalizedBaseUrl,
      config: config ?? {},
      isActive: true,
    })
    .returning();

  return NextResponse.json(server, { status: 201 });
}
