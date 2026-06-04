"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ShieldX, Activity } from "lucide-react";

export interface AuditEntry {
  id: string;
  timestamp: string;
  tool: string;
  scope: string;
  status: "allowed" | "denied";
  latency: number;
  clientId: string;
}

interface AuditLogProps {
  entries: AuditEntry[];
}

const SCOPE_COLORS: Record<string, string> = {
  "mcp:read": "text-blue-400 bg-blue-500/10 border-blue-500/20",
  "mcp:write": "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  "mcp:admin": "text-red-400 bg-red-500/10 border-red-500/20",
  "mcp:connections": "text-purple-400 bg-purple-500/10 border-purple-500/20",
};

export default function AuditLog({ entries }: AuditLogProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-600 gap-2">
        <Activity size={24} />
        <p className="text-xs font-mono">No audit events yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto scrollbar-thin pr-1">
      <AnimatePresence initial={false}>
        {[...entries].reverse().map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs font-mono ${
              entry.status === "allowed"
                ? "bg-emerald-500/5 border-emerald-500/15"
                : "bg-red-500/5 border-red-500/15"
            }`}
          >
            {/* Icon */}
            {entry.status === "allowed" ? (
              <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
            ) : (
              <ShieldX size={13} className="text-red-400 shrink-0" />
            )}

            {/* Tool */}
            <span className="text-slate-300 w-32 truncate shrink-0">{entry.tool}</span>

            {/* Scope */}
            <span
              className={`px-1.5 py-0.5 rounded border text-[10px] shrink-0 ${
                SCOPE_COLORS[entry.scope] || "text-slate-400 bg-slate-500/10 border-slate-500/20"
              }`}
            >
              {entry.scope}
            </span>

            {/* Status */}
            <span
              className={`shrink-0 font-semibold ${
                entry.status === "allowed" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {entry.status.toUpperCase()}
            </span>

            {/* Latency */}
            <span className="text-slate-600 ml-auto shrink-0">{entry.latency}ms</span>

            {/* Timestamp */}
            <span className="text-slate-700 shrink-0">{entry.timestamp}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
