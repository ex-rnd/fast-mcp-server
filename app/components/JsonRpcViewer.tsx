"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Copy, Check } from "lucide-react";
import { useState } from "react";

interface JsonRpcViewerProps {
  request: object | null;
  response: object | null;
  latency?: number;
  status?: "allowed" | "denied" | "pending" | null;
}

function JsonBlock({
  data,
  direction,
  label,
}: {
  data: object;
  direction: "request" | "response";
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const isRequest = direction === "request";
  const json = JSON.stringify(data, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-semibold ${
            isRequest
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          {isRequest ? (
            <ArrowRight size={10} />
          ) : (
            <ArrowLeft size={10} />
          )}
          {label}
        </div>
        <button
          onClick={copy}
          className="ml-auto p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="bg-[#0d1117] border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto max-h-80 leading-relaxed scrollbar-thin">
        <code
          dangerouslySetInnerHTML={{
            __html: syntaxHighlight(json),
          }}
        />
      </pre>
    </div>
  );
}

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = "text-[#79c0ff]"; // number
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = "text-[#ff7b72]"; // key
          } else {
            cls = "text-[#a5d6ff]"; // string
          }
        } else if (/true|false/.test(match)) {
          cls = "text-[#56d364]"; // boolean
        } else if (/null/.test(match)) {
          cls = "text-[#8b949e]"; // null
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
}

export default function JsonRpcViewer({
  request,
  response,
  latency,
  status,
}: JsonRpcViewerProps) {
  if (!request && !response) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-600 gap-3">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
          <ArrowRight size={16} />
        </div>
        <p className="text-sm font-mono">Select a tool and execute to see JSON-RPC messages</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={JSON.stringify(request)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        {/* Status + Latency Bar */}
        {status && (
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
                status === "allowed"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : status === "denied"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
              }`}
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  status === "allowed"
                    ? "bg-emerald-400"
                    : status === "denied"
                    ? "bg-red-400"
                    : "bg-yellow-400"
                } animate-pulse`}
              />
              {status === "allowed"
                ? "AUTHORIZED"
                : status === "denied"
                ? "POLICY DENIED"
                : "PENDING"}
            </div>
            {latency !== undefined && (
              <span className="text-xs font-mono text-slate-500">
                {latency}ms
              </span>
            )}
            <span className="text-xs font-mono text-slate-600 ml-auto">
              JSON-RPC 2.0
            </span>
          </div>
        )}

        {/* Request + Response */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {request && (
            <JsonBlock data={request} direction="request" label="→ REQUEST" />
          )}
          {response && (
            <JsonBlock data={response} direction="response" label="← RESPONSE" />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
