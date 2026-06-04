import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSdk, session } from "@descope/nextjs-sdk/server";
import { getDcrRecord, putDcrRecord } from "@/lib/mcpDcrStore";

function generateClientId(): string {
  return `mcp-client-${uuidv4().slice(0, 12)}`;
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string");
}

function policyScopesFromSession(token: Record<string, unknown>): string[] {
  const permissions = asStringArray(token.permissions);
  const roles = asStringArray(token.roleNames);
  if (permissions.length > 0) return permissions;

  const baseline = new Set<string>(["mcp:read", "mcp:connections"]);
  if (roles.includes("mcp-writer")) baseline.add("mcp:write");
  if (roles.includes("mcp-admin")) {
    baseline.add("mcp:write");
    baseline.add("mcp:admin");
  }
  return Array.from(baseline);
}

function intersectScopes(requested: string[], allowed: string[]): string[] {
  const allowSet = new Set(allowed);
  return requested.filter((scope) => allowSet.has(scope));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, clientName, requestedScopes, projectId, clientId } = body;

  const serviceKeyHeader = req.headers.get("x-mcp-service-key");
  const serviceKey = process.env.MCP_SERVICE_KEY || "";
  const serviceMode = Boolean(serviceKey && serviceKeyHeader === serviceKey);

  const auth = serviceMode ? undefined : await session();
  if (!serviceMode && !auth?.token) {
    return NextResponse.json(
      { error: "Authentication required. Sign in via Descope first." },
      { status: 401 },
    );
  }

  const currentToken = (auth?.token || {}) as Record<string, unknown>;
  const currentSub = serviceMode
    ? String(body.subject || "service-client")
    : String(currentToken.sub || "");
  const currentEmail = serviceMode
    ? (typeof body.email === "string" ? body.email : "service@local")
    : currentToken.email;

  // Dynamic Client Registration (Descope access key creation)
  if (action === "register") {
    const ownerSub = currentSub;
    if (!ownerSub) {
      return NextResponse.json({ error: "Session missing subject" }, { status: 401 });
    }
    if (!process.env.DESCOPE_MANAGEMENT_KEY) {
      return NextResponse.json(
        { error: "DESCOPE_MANAGEMENT_KEY is required for dynamic client registration." },
        { status: 500 },
      );
    }

    const requested = asStringArray(requestedScopes);
    const policyScopes = serviceMode
      ? requested
      : policyScopesFromSession(currentToken);
    const granted = intersectScopes(requested, policyScopes);
    if (granted.length === 0) {
      return NextResponse.json(
        { error: "No scopes granted by policy for this session." },
        { status: 403 },
      );
    }

    const registeredClientId = generateClientId();
    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 3600;
    const createRes = await sdk.management.accessKey.create(
      `mcp-${registeredClientId}`,
      expiresAtUnix,
      undefined,
      undefined,
      undefined,
      {
        mcpClientId: registeredClientId,
        ownerSub,
        scopes: granted,
      },
      "MCP DCR access key",
    );
    if (createRes.error || !createRes.data?.cleartext) {
      return NextResponse.json(
        { error: createRes.error?.errorDescription || "Failed to register client in Descope." },
        { status: 500 },
      );
    }

    putDcrRecord({
      clientId: registeredClientId,
      ownerSub,
      grantedScopes: granted,
      accessKey: createRes.data.cleartext,
      registeredAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      clientId: registeredClientId,
      clientName: clientName || "demo-mcp-agent-v1",
      registeredAt: new Date().toISOString(),
      projectId: projectId || "P2xyz_demo_project",
      scopes: granted,
      policyScopes,
      scopesRequested: requested,
      subject: currentSub,
      email: currentEmail,
      descopeConsoleUrl: `https://app.descope.com/agentic?client=${registeredClientId}`,
    });
  }

  // Token exchange (Descope access-key exchange)
  if (action === "exchange_token") {
    const ownerSub = currentSub;
    if (!ownerSub) {
      return NextResponse.json({ error: "Session missing subject" }, { status: 401 });
    }
    if (typeof clientId !== "string" || !clientId) {
      return NextResponse.json({ error: "clientId is required for token exchange." }, { status: 400 });
    }

    const requested = asStringArray(requestedScopes);
    const policyScopes = serviceMode
      ? requested
      : policyScopesFromSession(currentToken);
    const granted = intersectScopes(requested, policyScopes);
    const dcr = getDcrRecord(ownerSub, clientId);
    if (!dcr) {
      return NextResponse.json(
        { error: "Unknown clientId for this user. Run register first." },
        { status: 404 },
      );
    }

    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    let authInfo;
    try {
      authInfo = await sdk.exchangeAccessKey(dcr.accessKey);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Token exchange failed." },
        { status: 500 },
      );
    }
    const token = authInfo.jwt;
    const tokenExp = Number(authInfo.token.exp || 0);
    const issuedAt = new Date();
    const expiresAt = tokenExp ? new Date(tokenExp * 1000) : new Date(issuedAt.getTime() + 3600 * 1000);

    return NextResponse.json({
      success: true,
      token,
      tokenPreview: `${token.slice(0, 16)}...`,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      expiresIn: 3600,
      scopes: granted,
      policyScopes,
      scopesRequested: requested,
      issuer: `descope:${projectId || "P2xyz_demo_project"}`,
      audience: "mcp-server",
      subject: currentSub,
    });
  }

  // Connection token via Descope outbound application
  if (action === "get_connection_token") {
    const provider = body.provider || "github";
    if (provider !== "github") {
      return NextResponse.json({ error: "Only github provider is configured in this demo." }, { status: 400 });
    }
    const appId = process.env.DESCOPE_OUTBOUND_APP_ID;
    if (!appId) {
      return NextResponse.json(
        { error: "DESCOPE_OUTBOUND_APP_ID is required for Connections token retrieval." },
        { status: 500 },
      );
    }

    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    const tokenRes = await sdk.management.outboundApplication.fetchTokenByScopes(
      appId,
      currentSub,
      ["repo", "read:org"],
      { withRefreshToken: false },
    );
    if (tokenRes.error || !tokenRes.data?.accessToken) {
      return NextResponse.json(
        { error: tokenRes.error?.errorDescription || "Failed to fetch token from Descope outbound app." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      provider,
      token: tokenRes.data.accessToken,
      tokenPreview: `${tokenRes.data.accessToken.slice(0, 16)}...[managed by Descope]`,
      issuedAt: new Date().toISOString(),
      expiresIn: tokenRes.data.accessTokenExpiry
        ? Math.max(1, tokenRes.data.accessTokenExpiry - Math.floor(Date.now() / 1000))
        : 300,
      lifecycle: "descope_managed",
      note: "Token fetched from Descope outbound application with scoped access.",
    });
  }

  if (action === "introspect_token") {
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    try {
      const authInfo = await sdk.validateJwt(token);
      return NextResponse.json({
        success: true,
        token: authInfo.token,
        subject: authInfo.token.sub,
        scopes: asStringArray(authInfo.token.scopes),
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Token introspection failed" },
        { status: 401 },
      );
    }
  }

  if (action === "create_audit_event") {
    if (!process.env.DESCOPE_MANAGEMENT_KEY) {
      return NextResponse.json(
        { error: "DESCOPE_MANAGEMENT_KEY is required for audit event creation." },
        { status: 500 },
      );
    }
    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    const actionName = typeof body.eventAction === "string" ? body.eventAction : "mcp.tool.event";
    const type = body.eventType === "warn" || body.eventType === "error" ? body.eventType : "info";
    await sdk.management.audit.createEvent({
      action: actionName,
      type,
      actorId: currentSub || "unknown",
      tenantId: "",
      data: typeof body.data === "object" && body.data ? body.data : {},
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
