"use client";

import { useMemo, useState } from "react";
import { Descope } from "@descope/nextjs-sdk";
import { useDescope, useSession, useUser } from "@descope/nextjs-sdk/client";
import { CheckCircle2, ShieldAlert, ShieldCheck, LogOut, RefreshCw } from "lucide-react";

type ValidationResult = {
  ok: boolean;
  token?: Record<string, unknown>;
  jwtPreview?: string;
  error?: string;
};

function previewToken(token: string | null | undefined): string {
  if (!token) return "n/a";
  if (token.length <= 24) return token;
  return `${token.slice(0, 16)}...${token.slice(-8)}`;
}

export default function DescopeTestPanel() {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

  if (!projectId) {
    return (
      <div className="bg-[#0d1117] border border-red-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert size={14} className="text-red-400" />
          <h3 className="text-xs font-semibold text-red-300 uppercase tracking-wider">
            Descope Not Configured
          </h3>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Set <code>NEXT_PUBLIC_DESCOPE_PROJECT_ID</code> in <code>.env.local</code> and restart
          the app.
        </p>
      </div>
    );
  }

  return <DescopeTestPanelWithProvider />;
}

function DescopeTestPanelWithProvider() {
  const sdk = useDescope();
  const { isAuthenticated, isSessionLoading, sessionToken } = useSession();
  const { user } = useUser();

  const [authResponse, setAuthResponse] = useState<Record<string, unknown> | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  const sessionPreview = useMemo(() => previewToken(sessionToken), [sessionToken]);

  const validateSession = async (token: string | null | undefined) => {
    if (!token) return;
    setValidating(true);
    setValidation(null);
    try {
      const res = await fetch("/api/auth/validate-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: token }),
      });
      const data = (await res.json()) as ValidationResult;
      setValidation(data);
    } catch (error) {
      setValidation({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to validate session",
      });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="bg-[#0d1117] border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={14} className="text-emerald-400" />
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Real Descope Auth Test
        </h3>
      </div>

      {!isAuthenticated && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
          <Descope
            flowId="sign-up-or-in"
            theme="light"
            onSuccess={(e) => {
              const detail = (e as CustomEvent).detail as Record<string, unknown>;
              setAuthResponse(detail);
              const jwt = detail?.sessionJwt as string | undefined;
              void validateSession(jwt);
            }}
            onError={(error) => {
              setValidation({
                ok: false,
                error: `Descope flow error: ${String(error)}`,
              });
            }}
          />
        </div>
      )}

      {isSessionLoading && (
        <p className="text-xs text-slate-400 flex items-center gap-2">
          <RefreshCw size={12} className="animate-spin" /> Checking session...
        </p>
      )}

      {isAuthenticated && (
        <div className="space-y-2 text-xs">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5">
            <p className="font-mono text-emerald-300">Authenticated</p>
            <p className="text-slate-300 mt-1">{String(user?.name || user?.email || "User")}</p>
            <p className="text-slate-500 font-mono mt-1 break-all">session: {sessionPreview}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void validateSession(sessionToken)}
              disabled={validating}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700/40 text-white"
            >
              {validating ? "Validating..." : "Validate Session (Backend)"}
            </button>
            <button
              onClick={() => void sdk.logout()}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-700 text-slate-300 hover:border-slate-500 flex items-center gap-1.5"
            >
              <LogOut size={12} />
              Logout
            </button>
          </div>
        </div>
      )}

      {validation && (
        <div
          className={`rounded-lg p-2.5 border text-xs ${
            validation.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          <div className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 size={12} />
            {validation.ok ? "Session validated on backend" : "Session validation failed"}
          </div>
          {validation.error && <p className="mt-1 text-red-200">{validation.error}</p>}
          {validation.jwtPreview && (
            <p className="mt-1 font-mono text-[10px] break-all">jwt: {validation.jwtPreview}</p>
          )}
        </div>
      )}

      {authResponse && (
        <details className="rounded-lg border border-slate-700 bg-slate-900/40 p-2.5">
          <summary className="text-xs text-slate-300 cursor-pointer">Auth response payload</summary>
          <pre className="mt-2 text-[10px] text-slate-400 overflow-auto max-h-40">
            {JSON.stringify(authResponse, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
