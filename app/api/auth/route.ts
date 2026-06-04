import { NextRequest, NextResponse } from "next/server";

function backendUrl(path: string): string {
  const base = process.env.BACKEND_BASE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const serviceKey = process.env.MCP_SERVICE_KEY || "";

    const proxiedBody = {
      subject: process.env.STARTER_SUBJECT || "starter-user",
      email: process.env.STARTER_EMAIL || "starter@local",
      ...body,
    };

    const res = await fetch(backendUrl("/api/auth"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(serviceKey ? { "x-mcp-service-key": serviceKey } : {}),
      },
      body: JSON.stringify(proxiedBody),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth proxy failed" },
      { status: 500 },
    );
  }
}
