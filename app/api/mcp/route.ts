import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSdk, session } from "@descope/nextjs-sdk/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Tool definitions with scope requirements — mirrors mcp_server.py
const TOOLS = [
  {
    name: "read_database",
    description: "Read records from the database",
    scope: "mcp:read",
    category: "read",
    params: ["table", "limit", "filter"],
    danger: "low",
  },
  {
    name: "list_tables",
    description: "List all available tables",
    scope: "mcp:read",
    category: "read",
    params: [],
    danger: "low",
  },
  {
    name: "insert_record",
    description: "Insert a new record into the database",
    scope: "mcp:write",
    category: "write",
    params: ["table", "payload"],
    danger: "medium",
  },
  {
    name: "delete_record",
    description: "Permanently delete a record",
    scope: "mcp:admin",
    category: "admin",
    params: ["table", "record_id"],
    danger: "high",
  },
  {
    name: "run_query",
    description: "Execute a raw SQL query",
    scope: "mcp:admin",
    category: "admin",
    params: ["query"],
    danger: "critical",
  },
  {
    name: "fetch_github_issues",
    description: "Fetch GitHub issues via Descope Connections",
    scope: "mcp:connections",
    category: "connections",
    params: ["repo", "state"],
    danger: "low",
  },
];

type SessionContext = {
  userId: string;
  email?: string;
  permissions: string[];
  roles: string[];
};

type DbTableRecord = Record<string, unknown> & {
  id: number;
  created_at: string;
  updated_at?: string;
};

type DbSchema = {
  users: DbTableRecord[];
  orders: DbTableRecord[];
  products: DbTableRecord[];
  audit_logs: DbTableRecord[];
};

const DATA_FILE = path.join(process.cwd(), "data", "db.json");

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string");
}

function intersectScopes(requested: string[], allowed: string[]): string[] {
  if (allowed.length === 0) return requested;
  const allowSet = new Set(allowed);
  return requested.filter((scope) => allowSet.has(scope));
}

function derivePolicyScopes(ctx: SessionContext): string[] {
  // Baseline least-privilege policy for signed-in users
  const baseline = new Set<string>(["mcp:read", "mcp:connections"]);

  if (ctx.roles.includes("mcp-writer")) {
    baseline.add("mcp:write");
  }
  if (ctx.roles.includes("mcp-admin")) {
    baseline.add("mcp:write");
    baseline.add("mcp:admin");
  }

  // If explicit Descope permissions exist, they become the policy source of truth.
  if (ctx.permissions.length > 0) {
    return ctx.permissions;
  }

  return Array.from(baseline);
}

async function getSessionContext(): Promise<SessionContext | null> {
  const auth = await session();
  if (!auth?.token) return null;
  return {
    userId: String(auth.token.sub || "unknown"),
    email: typeof auth.token.email === "string" ? auth.token.email : undefined,
    permissions: asStringArray(auth.token.permissions),
    roles: asStringArray(auth.token.roleNames),
  };
}

async function readDb(): Promise<DbSchema> {
  const raw = await readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw) as DbSchema;
}

async function writeDb(db: DbSchema): Promise<void> {
  await writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
}

function parseTableName(input: unknown): keyof DbSchema {
  if (typeof input !== "string") {
    throw new Error("Missing or invalid table name");
  }
  const table = input as keyof DbSchema;
  if (!["users", "orders", "products", "audit_logs"].includes(table)) {
    throw new Error(`Unknown table '${input}'`);
  }
  return table;
}

function nextId(records: DbTableRecord[]): number {
  return records.reduce((max, record) => Math.max(max, Number(record.id) || 0), 0) + 1;
}

async function getGithubToken(userId: string): Promise<{ token: string; source: string }> {
  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, source: "env:GITHUB_TOKEN" };
  }

  const appId = process.env.DESCOPE_OUTBOUND_APP_ID;
  if (!appId) {
    throw new Error("No GitHub token configured. Set GITHUB_TOKEN or DESCOPE_OUTBOUND_APP_ID.");
  }

  const sdk = createSdk({
    projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
    managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
  });

  const tokenRes = await sdk.management.outboundApplication.fetchTokenByScopes(
    appId,
    userId,
    ["repo", "read:org"],
    { withRefreshToken: false },
  );
  if (tokenRes.error || !tokenRes.data?.accessToken) {
    throw new Error(tokenRes.error?.errorDescription || "Failed to fetch token from Descope outbound application");
  }

  return { token: tokenRes.data.accessToken, source: "descope_outbound_application" };
}

function runLimitedQuery(query: string, db: DbSchema): { rows?: unknown[]; rowsAffected?: number } {
  const normalized = query.trim().replace(/\s+/g, " ");

  const countMatch = normalized.match(
    /^SELECT COUNT\(\*\) FROM (\w+)(?: WHERE (\w+)\s*=\s*'?(.+?)'?)?;?$/i,
  );
  if (countMatch) {
    const table = parseTableName(countMatch[1]);
    const whereField = countMatch[2];
    const whereValue = countMatch[3];
    const rows = db[table].filter((record) => {
      if (!whereField) return true;
      return String(record[whereField]) === String(whereValue);
    });
    return { rows: [{ count: rows.length }] };
  }

  const selectMatch = normalized.match(/^SELECT \* FROM (\w+)(?: LIMIT (\d+))?;?$/i);
  if (selectMatch) {
    const table = parseTableName(selectMatch[1]);
    const limit = Number(selectMatch[2] || 25);
    return { rows: db[table].slice(0, limit) };
  }

  throw new Error("Unsupported query. Allowed: SELECT COUNT(*) ... or SELECT * ... LIMIT n");
}

async function createAuditEvent(
  actorId: string,
  action: string,
  type: "info" | "warn" | "error",
  data: Record<string, unknown>,
): Promise<void> {
  if (!process.env.DESCOPE_MANAGEMENT_KEY) {
    return;
  }

  try {
    const sdk = createSdk({
      projectId: process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID,
      managementKey: process.env.DESCOPE_MANAGEMENT_KEY,
    });
    await sdk.management.audit.createEvent({
      action,
      type,
      actorId,
      tenantId: "",
      data,
    });
  } catch {
    // Non-blocking: tool calls should continue even if audit ingestion is unavailable.
  }
}

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  grantedScopes: string[],
  authContext: SessionContext,
): Promise<{ result?: unknown; error?: unknown; latency: number }> {
  const start = Date.now();
  const tool = TOOLS.find((t) => t.name === toolName);

  if (!tool) {
    return { error: { code: -32601, message: "Method not found" }, latency: 2 };
  }

  if (!grantedScopes.includes(tool.scope)) {
    const latency = Date.now() - start;
    await createAuditEvent(authContext.userId, "mcp.tool.denied", "warn", {
      tool: toolName,
      requiredScope: tool.scope,
      grantedScopes,
    });
    return {
      error: {
        code: -32001,
        message: "Authorization denied",
        data: {
          scope_required: tool.scope,
          scopes_granted: grantedScopes,
          policy: "least_privilege",
        },
      },
      latency,
    };
  }

  try {
    let result: unknown;
    const db = await readDb();

    switch (toolName) {
      case "list_tables": {
        result = {
          status: "success",
          tables: Object.entries(db).map(([name, records]) => ({
            name,
            rows: records.length,
            last_modified:
              records.length > 0
                ? String(records[records.length - 1].updated_at || records[records.length - 1].created_at)
                : "n/a",
          })),
          scope_used: "mcp:read",
        };
        break;
      }
      case "read_database": {
        const table = parseTableName(args.table);
        const limit = Number(args.limit ?? 10);
        const filterValue = typeof args.filter === "string" ? args.filter : undefined;
        const filtered = filterValue
          ? db[table].filter((record) => JSON.stringify(record).toLowerCase().includes(filterValue.toLowerCase()))
          : db[table];
        result = {
          status: "success",
          table,
          records: filtered.slice(0, Math.max(limit, 0)),
          count: Math.min(filtered.length, Math.max(limit, 0)),
          total: filtered.length,
          scope_used: "mcp:read",
        };
        break;
      }
      case "insert_record": {
        const table = parseTableName(args.table);
        if (typeof args.payload !== "object" || args.payload === null || Array.isArray(args.payload)) {
          throw new Error("Payload must be an object");
        }
        const record: DbTableRecord = {
          id: nextId(db[table]),
          ...(args.payload as Record<string, unknown>),
          created_at: new Date().toISOString(),
        };
        db[table].push(record);
        await writeDb(db);
        result = {
          status: "success",
          table,
          inserted_id: record.id,
          payload: record,
          scope_used: "mcp:write",
        };
        break;
      }
      case "delete_record": {
        const table = parseTableName(args.table);
        const recordId = Number(args.record_id);
        const before = db[table].length;
        db[table] = db[table].filter((record) => Number(record.id) !== recordId);
        const removed = before - db[table].length;
        await writeDb(db);
        result = {
          status: "success",
          table,
          deleted_id: recordId,
          removed,
          message: removed ? `Record ${recordId} deleted from ${table}` : `Record ${recordId} not found in ${table}`,
          scope_used: "mcp:admin",
        };
        break;
      }
      case "run_query": {
        const query = typeof args.query === "string" ? args.query : "";
        if (!query) throw new Error("Missing query");
        const out = runLimitedQuery(query, db);
        result = {
          status: "success",
          query,
          rows: out.rows ?? [],
          rows_affected: out.rowsAffected ?? 0,
          scope_used: "mcp:admin",
        };
        break;
      }
      case "fetch_github_issues": {
        const repo = typeof args.repo === "string" ? args.repo : "";
        const state = typeof args.state === "string" ? args.state : "open";
        if (!repo) throw new Error("Missing repo (format: owner/name)");

        const { token, source } = await getGithubToken(authContext.userId);
        const res = await fetch(
          `https://api.github.com/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=10`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
            },
          },
        );
        if (!res.ok) {
          throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
        }
        const issues = (await res.json()) as Array<Record<string, unknown>>;
        result = {
          status: "success",
          repo,
          state,
          issues: issues.map((issue) => ({
            id: issue.id,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.html_url,
          })),
          token_source: source,
          scope_used: "mcp:connections",
        };
        break;
      }
      default:
        throw new Error("Unknown tool");
    }

    const latency = Date.now() - start;
    await createAuditEvent(authContext.userId, "mcp.tool.allowed", "info", {
      tool: toolName,
      latencyMs: latency,
      scope: tool.scope,
    });
    return { result, latency };
  } catch (error) {
    const latency = Date.now() - start;
    await createAuditEvent(authContext.userId, "mcp.tool.error", "error", {
      tool: toolName,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      error: {
        code: -32002,
        message: error instanceof Error ? error.message : "Tool execution error",
      },
      latency,
    };
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, tool, args, grantedScopes, clientId } = body;

  if (action === "list_tools") {
    return NextResponse.json({ tools: TOOLS });
  }

  if (action === "initialize") {
    const authContext = await getSessionContext();
    if (!authContext) {
      return NextResponse.json(
        {
          error: "Authentication required. Sign in via Descope first.",
        },
        { status: 401 },
      );
    }

    const requestedScopes = asStringArray(grantedScopes);
    const policyScopes = derivePolicyScopes(authContext);
    const effectiveScopes = intersectScopes(requestedScopes, policyScopes);
    const resolvedClientId =
      typeof clientId === "string" && clientId ? clientId : `mcp-client-${uuidv4().slice(0, 12)}`;

    return NextResponse.json({
      jsonrpc: "2.0",
      id: uuidv4().slice(0, 8),
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "secure-data-server", version: "1.0.0" },
        capabilities: {
          tools: { listChanged: true },
          logging: {},
        },
        auth: {
          validated: true,
          client_id: resolvedClientId,
          scopes_requested: requestedScopes,
          scopes_granted: effectiveScopes,
          policy_source: authContext.permissions.length
            ? "descope_permissions"
            : "role_based_default_policy",
          policy_scopes: policyScopes,
          user: {
            id: authContext.userId,
            email: authContext.email ?? "n/a",
            roles: authContext.roles,
          },
          token_source: "descope_session_cookie",
          issued_at: new Date().toISOString(),
          expires_in: 3600,
        },
      },
    });
  }

  if (action === "call_tool") {
    const authContext = await getSessionContext();
    if (!authContext) {
      return NextResponse.json(
        {
          error: "Authentication required. Sign in via Descope first.",
        },
        { status: 401 },
      );
    }

    const requestedScopes = asStringArray(grantedScopes);
    const policyScopes = derivePolicyScopes(authContext);
    const effectiveScopes = intersectScopes(requestedScopes, policyScopes);
    const requestId = uuidv4().slice(0, 8);
    const { result, error, latency } = await executeTool(
      tool,
      args || {},
      effectiveScopes,
      authContext,
    );

    const rpcRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method: "tools/call",
      params: { name: tool, arguments: args || {} },
    };

    const rpcResponse = error
      ? { jsonrpc: "2.0", id: requestId, error }
      : { jsonrpc: "2.0", id: requestId, result };

    return NextResponse.json({
      requestId,
      rpcRequest,
      rpcResponse,
      latency,
      status: error ? "denied" : "allowed",
      tool: TOOLS.find((t) => t.name === tool),
      authContext: {
        userId: authContext.userId,
        email: authContext.email ?? "n/a",
        scopesRequested: requestedScopes,
        policyScopes,
        scopesGranted: effectiveScopes,
        policySource: authContext.permissions.length
          ? "descope_permissions"
          : "role_based_default_policy",
      },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
