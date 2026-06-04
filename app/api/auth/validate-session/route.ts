import { NextRequest, NextResponse } from "next/server";
import { createSdk } from "@descope/nextjs-sdk/server";

type RequestBody = {
  sessionToken?: string;
};

function jwtPreview(jwt: string): string {
  if (jwt.length < 24) return jwt;
  return `${jwt.slice(0, 16)}...${jwt.slice(-8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RequestBody;
    const sessionToken = body.sessionToken;

    if (!sessionToken) {
      return NextResponse.json(
        { ok: false, error: "Missing sessionToken" },
        { status: 400 },
      );
    }

    const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        {
          ok: false,
          error: "NEXT_PUBLIC_DESCOPE_PROJECT_ID is not configured",
        },
        { status: 500 },
      );
    }

    const sdk = createSdk({
      projectId,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });

    const authInfo = await sdk.validateSession(sessionToken);

    return NextResponse.json({
      ok: true,
      jwtPreview: jwtPreview(authInfo.jwt),
      token: authInfo.token,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Descope error";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}
