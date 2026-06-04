import { NextRequest, NextResponse } from "next/server";

function backendUrl(path: string): string {
  const base = process.env.BACKEND_BASE_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(backendUrl("/api/auth/validate-session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "validate-session proxy failed" },
      { status: 500 },
    );
  }
}
