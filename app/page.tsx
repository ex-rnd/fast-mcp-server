"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  Zap,
  Play,
  RefreshCw,
  ChevronRight,
  Key,
  Database,
  Lock,
  Unlock,
  Activity,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  GitBranch,
  Cpu,
  Radio,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import JsonRpcViewer from "./components/JsonRpcViewer";
import AuditLog, { AuditEntry } from "./components/AuditLog";
import ToolCard, { Tool } from "./components/ToolCard";
import DescopeTestPanel from "./components/DescopeTestPanel";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Phase = "idle" | "registering" | "registered" | "exchanging" | "connected";

interface AuthState {
  phase: Phase;
  clientId: string | null;
  token: string | null;
  tokenPreview: string | null;
  grantedScopes: string[];
  registeredAt: string | null;
  expiresAt: string | null;
}

type ApiError = {
  message: string;
};

const SCOPE_OPTIONS = [
  { id: "mcp:read", label: "mcp:read", color: "blue", description: "Read tools" },
  { id: "mcp:write", label: "mcp:write", color: "yellow", description: "Write tools" },
  { id: "mcp:admin", label: "mcp:admin", color: "red", description: "Admin tools" },
  { id: "mcp:connections", label: "mcp:connections", color: "purple", description: "OAuth vaulting" },
];

const DEFAULT_ARGS: Record<string, Record<string, unknown>> = {
  read_database: { table: "users", limit: 3 },
  list_tables: {},
  insert_record: { table: "orders", payload: { product_id: 42, qty: 1 } },
  delete_record: { table: "users", record_id: 7 },
  run_query: { query: "SELECT COUNT(*) FROM users WHERE active = true" },
  fetch_github_issues: { repo: "myorg/mcp-demo", state: "open" },
};

// ─────────────────────────────────────────────────────────────
// Component: Scope Toggle
// ─────────────────────────────────────────────────────────────

function ScopeToggle({
  scope,
  active,
  onToggle,
}: {
  scope: (typeof SCOPE_OPTIONS)[0];
  active: boolean;
  onToggle: () => void;
}) {
  const colorMap: Record<string, string> = {
    blue: active
      ? "border-blue-500 bg-blue-500/15 text-blue-300"
      : "border-slate-700 text-slate-500 hover:border-slate-600",
    yellow: active
      ? "border-yellow-500 bg-yellow-500/15 text-yellow-300"
      : "border-slate-700 text-slate-500 hover:border-slate-600",
    red: active
      ? "border-red-500 bg-red-500/15 text-red-300"
      : "border-slate-700 text-slate-500 hover:border-slate-600",
    purple: active
      ? "border-purple-500 bg-purple-500/15 text-purple-300"
      : "border-slate-700 text-slate-500 hover:border-slate-600",
  };

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all duration-150 ${colorMap[scope.color]}`}
    >
      {active ? <Unlock size={10} /> : <Lock size={10} />}
      {scope.label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────

export default function HomePage() {
  // Auth state
  const [auth, setAuth] = useState<AuthState>({
    phase: "idle",
    clientId: null,
    token: null,
    tokenPreview: null,
    grantedScopes: ["mcp:read", "mcp:connections"],
    registeredAt: null,
    expiresAt: null,
  });
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "mcp:read",
    "mcp:connections",
  ]);
  const [showToken, setShowToken] = useState(false);
  const [projectId] = useState(
    process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID || "P2xyz_demo_project"
  );
  const [apiError, setApiError] = useState<ApiError | null>(null);

  // Tools state
  const [tools, setTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [toolArgs, setToolArgs] = useState<string>("");

  // RPC state
  const [rpcRequest, setRpcRequest] = useState<object | null>(null);
  const [rpcResponse, setRpcResponse] = useState<object | null>(null);
  const [rpcLatency, setRpcLatency] = useState<number | undefined>();
  const [rpcStatus, setRpcStatus] = useState<"allowed" | "denied" | null>(null);
  const [executing, setExecuting] = useState(false);

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);

  // Initialize
  const [initResponse, setInitResponse] = useState<object | null>(null);

  // Load tools
  useEffect(() => {
    fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_tools" }),
    })
      .then((r) => r.json())
      .then((d) => setTools(d.tools || []));
  }, []);

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId)
        ? prev.filter((s) => s !== scopeId)
        : [...prev, scopeId]
    );
  };

  // Step 1: Dynamic Client Registration
  const handleRegister = useCallback(async () => {
    setApiError(null);
    setAuth((a) => ({ ...a, phase: "registering" }));
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "register",
        clientName: "demo-mcp-agent-v1",
        requestedScopes: selectedScopes,
        projectId,
      }),
    });
    if (!res.ok) {
      const error = await res.json();
      setApiError({ message: error.error || "Failed to register agent identity" });
      setAuth((a) => ({ ...a, phase: "idle" }));
      return;
    }
    const data = await res.json();
    setAuth((a) => ({
      ...a,
      phase: "registered",
      clientId: data.clientId,
      grantedScopes: data.scopes,
      registeredAt: data.registeredAt,
    }));
  }, [selectedScopes, projectId]);

  // Step 2: Token Exchange
  const handleExchangeToken = useCallback(async () => {
    setApiError(null);
    setAuth((a) => ({ ...a, phase: "exchanging" }));
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "exchange_token",
        clientId: auth.clientId,
        requestedScopes: auth.grantedScopes,
        projectId,
      }),
    });
    if (!res.ok) {
      const error = await res.json();
      setApiError({ message: error.error || "Failed to exchange token" });
      setAuth((a) => ({ ...a, phase: "registered" }));
      return;
    }
    const data = await res.json();
    setAuth((a) => ({
      ...a,
      phase: "connected",
      token: data.token,
      tokenPreview: data.tokenPreview,
      expiresAt: data.expiresAt,
    }));

    // Also fire the initialize handshake
    const initRes = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "initialize",
        clientId: auth.clientId,
        grantedScopes: auth.grantedScopes,
      }),
    });
    if (!initRes.ok) {
      const error = await initRes.json();
      setApiError({ message: error.error || "Initialize handshake failed" });
      return;
    }
    const initData = await initRes.json();
    setInitResponse(initData);
  }, [auth.clientId, auth.grantedScopes, projectId]);

  // Step 3: Execute Tool
  const handleExecute = useCallback(async () => {
    if (!selectedTool) return;
    setApiError(null);
    setExecuting(true);
    setRpcRequest(null);
    setRpcResponse(null);

    let parsedArgs = {};
    try {
      parsedArgs = toolArgs ? JSON.parse(toolArgs) : DEFAULT_ARGS[selectedTool.name] || {};
    } catch {
      parsedArgs = DEFAULT_ARGS[selectedTool.name] || {};
    }

    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "call_tool",
        tool: selectedTool.name,
        args: parsedArgs,
        grantedScopes: auth.grantedScopes,
      }),
    });
    if (!res.ok) {
      const error = await res.json();
      setApiError({ message: error.error || "Tool execution failed" });
      setExecuting(false);
      return;
    }
    const data = await res.json();

    setRpcRequest(data.rpcRequest);
    setRpcResponse(data.rpcResponse);
    setRpcLatency(data.latency);
    setRpcStatus(data.status);

    // Add audit entry
    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date().toLocaleTimeString(),
      tool: selectedTool.name,
      scope: selectedTool.scope,
      status: data.status,
      latency: data.latency,
      clientId: auth.clientId || "unknown",
    };
    setAuditLog((prev) => [...prev, entry]);
    setExecuting(false);
  }, [selectedTool, toolArgs, auth.grantedScopes, auth.clientId]);

  const handleReset = () => {
    setAuth({
      phase: "idle",
      clientId: null,
      token: null,
      tokenPreview: null,
      grantedScopes: ["mcp:read", "mcp:connections"],
      registeredAt: null,
      expiresAt: null,
    });
    setSelectedScopes(["mcp:read", "mcp:connections"]);
    setRpcRequest(null);
    setRpcResponse(null);
    setRpcStatus(null);
    setInitResponse(null);
    setSelectedTool(null);
    setAuditLog([]);
    setApiError(null);
  };

  const isConnected = auth.phase === "connected";
  const isRegistered = auth.phase === "registered" || auth.phase === "exchanging" || isConnected;

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-200">
      {/* ── Top Nav ─────────────────────────────────────────── */}
      <header className="border-b border-slate-800 bg-[#0d1117]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Cpu size={14} className="text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              FastMCP <span className="text-slate-500">×</span>{" "}
              <span className="text-purple-400">Descope</span>
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          {/* Protocol badge */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50">
            <Radio size={10} className="text-emerald-400" />
            <span className="text-[10px] font-mono text-slate-400">JSON-RPC 2.0</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Connection status */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono ${
                isConnected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : auth.phase === "registering" || auth.phase === "exchanging"
                  ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                  : "border-slate-700 bg-slate-800/50 text-slate-500"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected
                    ? "bg-emerald-400 animate-pulse"
                    : auth.phase !== "idle"
                    ? "bg-yellow-400 animate-pulse"
                    : "bg-slate-600"
                }`}
              />
              {isConnected
                ? "Connected"
                : auth.phase === "registering"
                ? "Registering…"
                : auth.phase === "exchanging"
                ? "Exchanging token…"
                : auth.phase === "registered"
                ? "Token pending"
                : "Disconnected"}
            </div>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-all"
            >
              <RefreshCw size={11} />
              Reset
            </button>

            <a
              href="https://app.descope.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all"
            >
              Descope Console
              <ExternalLink size={10} />
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Layout ──────────────────────────────────────── */}
      <div className="max-w-screen-2xl mx-auto px-6 py-6 grid grid-cols-12 gap-5">

        {/* ── LEFT COLUMN: Auth + Identity ────────────────── */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <DescopeTestPanel />

          {/* Descope Identity Panel */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={14} className="text-purple-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Agentic Identity Hub
              </h2>
            </div>

            {/* Project ID */}
            <div className="mb-4">
              <label className="text-[10px] font-mono text-slate-600 uppercase mb-1 block">
                Descope Project ID
              </label>
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700/50 rounded-lg">
                <span className="text-xs font-mono text-slate-400 truncate">{projectId}</span>
              </div>
            </div>

            {/* Scope Selection */}
            <div className="mb-4">
              <label className="text-[10px] font-mono text-slate-600 uppercase mb-2 block">
                Requested Scopes (DCR)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {SCOPE_OPTIONS.map((s) => (
                  <ScopeToggle
                    key={s.id}
                    scope={s}
                    active={selectedScopes.includes(s.id)}
                    onToggle={() => toggleScope(s.id)}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
                Toggle scopes before registering to demo policy denial scenarios
              </p>
            </div>

            {/* Step 1: Register */}
            {apiError && (
              <div className="mb-2 text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-2.5 py-2">
                {apiError.message}
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={auth.phase !== "idle" || selectedScopes.length === 0}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all mb-2 ${
                isRegistered
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-default"
                  : auth.phase === "registering"
                  ? "bg-purple-500/20 border border-purple-500/30 text-purple-400 cursor-wait"
                  : "bg-purple-600 hover:bg-purple-500 text-white cursor-pointer"
              }`}
            >
              {isRegistered ? (
                <>
                  <CheckCircle size={12} />
                  DCR Complete
                </>
              ) : auth.phase === "registering" ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Registering…
                </>
              ) : (
                <>
                  <Key size={12} />
                  1. Register Agent (DCR)
                </>
              )}
            </button>

            {/* Step 2: Exchange Token */}
            <button
              onClick={handleExchangeToken}
              disabled={auth.phase !== "registered"}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isConnected
                  ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 cursor-default"
                  : auth.phase === "exchanging"
                  ? "bg-blue-500/20 border border-blue-500/30 text-blue-400 cursor-wait"
                  : auth.phase === "registered"
                  ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  : "bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed"
              }`}
            >
              {isConnected ? (
                <>
                  <ShieldCheck size={12} />
                  Token Active
                </>
              ) : auth.phase === "exchanging" ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Exchanging…
                </>
              ) : (
                <>
                  <Zap size={12} />
                  2. Exchange Token (M2M)
                </>
              )}
            </button>
          </div>

          {/* Identity Card */}
          <AnimatePresence>
            {isRegistered && auth.clientId && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck size={13} className="text-emerald-400" />
                  <h3 className="text-xs font-semibold text-slate-300">Client Identity</h3>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-[9px] font-mono text-slate-600 uppercase mb-0.5">Client ID</p>
                    <p className="text-xs font-mono text-slate-300 break-all">{auth.clientId}</p>
                  </div>

                  {auth.token && (
                    <div>
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[9px] font-mono text-slate-600 uppercase">Access Token</p>
                        <button
                          onClick={() => setShowToken(!showToken)}
                          className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
                        >
                          {showToken ? <EyeOff size={9} /> : <Eye size={9} />}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-emerald-400 break-all">
                        {showToken ? auth.token : auth.tokenPreview}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-[9px] font-mono text-slate-600 uppercase mb-1">
                      Granted Scopes
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {auth.grantedScopes.map((s) => (
                        <span
                          key={s}
                          className="px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold text-blue-400 bg-blue-500/10 border-blue-500/20"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {auth.expiresAt && (
                    <div>
                      <p className="text-[9px] font-mono text-slate-600 uppercase mb-0.5">Expires</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {new Date(auth.expiresAt).toLocaleTimeString()} (1h)
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Initialize Handshake Result */}
          <AnimatePresence>
            {initResponse && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0d1117] border border-emerald-500/20 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-3">
                  <GitBranch size={13} className="text-emerald-400" />
                  <h3 className="text-xs font-semibold text-slate-300">Initialize Handshake</h3>
                  <span className="ml-auto text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    200 OK
                  </span>
                </div>
                <pre className="text-[10px] font-mono text-slate-400 bg-[#0a0c10] rounded-lg p-3 overflow-auto max-h-40 leading-relaxed">
                  {JSON.stringify(initResponse, null, 2)}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── CENTER COLUMN: Tools + RPC ───────────────────── */}
        <div className="col-span-12 lg:col-span-6 space-y-4">

          {/* Tools Grid */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Database size={14} className="text-blue-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Available Tools
              </h2>
              <span className="ml-auto text-[10px] font-mono text-slate-600">
                {tools.length} registered
              </span>
            </div>

            {!isConnected && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/5 border border-yellow-500/20 text-xs text-yellow-400/80">
                <AlertTriangle size={11} />
                Connect to Descope first to execute tools
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {tools.map((tool) => (
                <ToolCard
                  key={tool.name}
                  tool={tool}
                  isSelected={selectedTool?.name === tool.name}
                  hasScope={
                    isConnected && auth.grantedScopes.includes(tool.scope)
                  }
                  onClick={() => {
                    setSelectedTool(tool);
                    setToolArgs(
                      JSON.stringify(DEFAULT_ARGS[tool.name] || {}, null, 2)
                    );
                    setRpcRequest(null);
                    setRpcResponse(null);
                    setRpcStatus(null);
                  }}
                />
              ))}
            </div>
          </div>

          {/* Tool Executor */}
          <AnimatePresence>
            {selectedTool && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#0d1117] border border-slate-800 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Play size={13} className="text-emerald-400" />
                  <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Execute: <span className="text-emerald-400 font-mono">{selectedTool.name}</span>
                  </h2>
                  <span
                    className={`ml-auto px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${
                      isConnected && auth.grantedScopes.includes(selectedTool.scope)
                        ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                        : "text-red-400 bg-red-500/10 border-red-500/25"
                    }`}
                  >
                    {isConnected && auth.grantedScopes.includes(selectedTool.scope) ? (
                      <span className="flex items-center gap-1">
                        <Unlock size={8} /> {selectedTool.scope}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock size={8} /> {selectedTool.scope} required
                      </span>
                    )}
                  </span>
                </div>

                {/* Args editor */}
                <div className="mb-3">
                  <label className="text-[10px] font-mono text-slate-600 uppercase mb-1 block">
                    Arguments (JSON)
                  </label>
                  <textarea
                    value={toolArgs}
                    onChange={(e) => setToolArgs(e.target.value)}
                    rows={4}
                    className="w-full bg-[#0a0c10] border border-slate-700/60 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                    placeholder="{}"
                  />
                </div>

                {/* Execute button */}
                <button
                  onClick={handleExecute}
                  disabled={!isConnected || executing}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    !isConnected
                      ? "bg-slate-800 border border-slate-700 text-slate-600 cursor-not-allowed"
                      : executing
                      ? "bg-blue-500/20 border border-blue-500/30 text-blue-400 cursor-wait"
                      : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                  }`}
                >
                  {executing ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Executing JSON-RPC call…
                    </>
                  ) : (
                    <>
                      <Play size={12} />
                      Execute Tool Call
                      <ChevronRight size={12} />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* JSON-RPC Viewer */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-4">
              <Radio size={13} className="text-blue-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                JSON-RPC Transport
              </h2>
              {rpcStatus && (
                <div className="ml-auto flex items-center gap-1.5">
                  {rpcStatus === "allowed" ? (
                    <CheckCircle size={12} className="text-emerald-400" />
                  ) : (
                    <XCircle size={12} className="text-red-400" />
                  )}
                </div>
              )}
            </div>
            <JsonRpcViewer
              request={rpcRequest}
              response={rpcResponse}
              latency={rpcLatency}
              status={rpcStatus}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN: Audit + Scopes ────────────────── */}
        <div className="col-span-12 lg:col-span-3 space-y-4">

          {/* Stats bar */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {auditLog.filter((e) => e.status === "allowed").length}
              </p>
              <p className="text-[10px] font-mono text-slate-600 mt-0.5">Authorized</p>
            </div>
            <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-red-400">
                {auditLog.filter((e) => e.status === "denied").length}
              </p>
              <p className="text-[10px] font-mono text-slate-600 mt-0.5">Denied</p>
            </div>
          </div>

          {/* Scope Legend */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={13} className="text-purple-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Scope Matrix
              </h2>
            </div>
            <div className="space-y-2">
              {[
                { scope: "mcp:read", tools: ["read_database", "list_tables"], color: "blue" },
                { scope: "mcp:write", tools: ["insert_record"], color: "yellow" },
                { scope: "mcp:admin", tools: ["delete_record", "run_query"], color: "red" },
                { scope: "mcp:connections", tools: ["fetch_github_issues"], color: "purple" },
              ].map(({ scope, tools: scopeTools, color }) => {
                const granted = isConnected && auth.grantedScopes.includes(scope);
                return (
                  <div
                    key={scope}
                    className={`p-2.5 rounded-lg border ${
                      granted
                        ? `border-${color}-500/25 bg-${color}-500/5`
                        : "border-slate-800 bg-slate-900/30"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {granted ? (
                        <Unlock size={9} className={`text-${color}-400`} />
                      ) : (
                        <Lock size={9} className="text-slate-600" />
                      )}
                      <span
                        className={`text-[10px] font-mono font-semibold ${
                          granted ? `text-${color}-400` : "text-slate-600"
                        }`}
                      >
                        {scope}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scopeTools.map((t) => (
                        <span
                          key={t}
                          className={`text-[9px] font-mono px-1 py-0.5 rounded ${
                            granted
                              ? "text-slate-400 bg-slate-800"
                              : "text-slate-700 bg-slate-900"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit Log */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={13} className="text-blue-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Agentic Activity
              </h2>
              <span className="ml-auto text-[10px] font-mono text-slate-600">
                {auditLog.length} events
              </span>
            </div>
            <AuditLog entries={auditLog} />

            {auditLog.length > 0 && (
              <a
                href="https://app.descope.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 text-xs text-purple-400 hover:bg-purple-500/10 transition-all"
              >
                View full audit in Descope
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          {/* Descope Connections info */}
          <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Key size={13} className="text-yellow-400" />
              <h2 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Connections Vault
              </h2>
            </div>
            <div className="space-y-2">
              {[
                { provider: "GitHub", status: "vaulted", icon: "🐙" },
                { provider: "HubSpot", status: "vaulted", icon: "🟠" },
                { provider: "Slack", status: "vaulted", icon: "💬" },
              ].map(({ provider, status, icon }) => (
                <div
                  key={provider}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-900/60 border border-slate-800"
                >
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs font-mono text-slate-400 flex-1">{provider}</span>
                  <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                    {status}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2.5 leading-relaxed">
              Raw OAuth tokens are managed by Descope. Agents receive short-lived, scoped credentials — never raw secrets.
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 mt-8 py-4 px-6">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-4 text-[10px] font-mono text-slate-700">
          <span>FastMCP × Descope · MCP Client Demo</span>
          <span className="mx-auto" />
          <span>JSON-RPC 2.0</span>
          <span>·</span>
          <span>Dynamic Client Registration</span>
          <span>·</span>
          <span>Least Privilege</span>
          <span>·</span>
          <span>Audit Logging</span>
        </div>
      </footer>
    </div>
  );
}
