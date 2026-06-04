"use client";

import { motion } from "framer-motion";
import {
  Database,
  List,
  FilePlus,
  Trash2,
  Terminal,
  Github,
  Lock,
  Unlock,
} from "lucide-react";

export interface Tool {
  name: string;
  description: string;
  scope: string;
  category: string;
  params: string[];
  danger: string;
}

interface ToolCardProps {
  tool: Tool;
  isSelected: boolean;
  hasScope: boolean;
  onClick: () => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  read_database: <Database size={15} />,
  list_tables: <List size={15} />,
  insert_record: <FilePlus size={15} />,
  delete_record: <Trash2 size={15} />,
  run_query: <Terminal size={15} />,
  fetch_github_issues: <Github size={15} />,
};

const DANGER_STYLES: Record<string, string> = {
  low: "border-slate-700 hover:border-blue-500/50",
  medium: "border-slate-700 hover:border-yellow-500/50",
  high: "border-slate-700 hover:border-orange-500/50",
  critical: "border-slate-700 hover:border-red-500/50",
};

const SCOPE_BADGE: Record<string, string> = {
  "mcp:read": "text-blue-400 bg-blue-500/10 border-blue-500/25",
  "mcp:write": "text-yellow-400 bg-yellow-500/10 border-yellow-500/25",
  "mcp:admin": "text-red-400 bg-red-500/10 border-red-500/25",
  "mcp:connections": "text-purple-400 bg-purple-500/10 border-purple-500/25",
};

const SELECTED_BORDER: Record<string, string> = {
  low: "border-blue-500 bg-blue-500/5",
  medium: "border-yellow-500 bg-yellow-500/5",
  high: "border-orange-500 bg-orange-500/5",
  critical: "border-red-500 bg-red-500/5",
};

export default function ToolCard({
  tool,
  isSelected,
  hasScope,
  onClick,
}: ToolCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
        isSelected
          ? SELECTED_BORDER[tool.danger]
          : DANGER_STYLES[tool.danger]
      } bg-slate-900/60`}
    >
      <div className="flex items-start gap-2.5">
        {/* Icon */}
        <div
          className={`mt-0.5 shrink-0 ${
            hasScope ? "text-slate-400" : "text-slate-600"
          }`}
        >
          {TOOL_ICONS[tool.name] || <Database size={15} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-xs font-mono font-semibold ${
                hasScope ? "text-slate-200" : "text-slate-500"
              }`}
            >
              {tool.name}
            </span>
            {hasScope ? (
              <Unlock size={9} className="text-emerald-400 shrink-0" />
            ) : (
              <Lock size={9} className="text-slate-600 shrink-0" />
            )}
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed mb-1.5 line-clamp-2">
            {tool.description}
          </p>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-mono font-semibold ${
              SCOPE_BADGE[tool.scope] ||
              "text-slate-400 bg-slate-500/10 border-slate-500/20"
            }`}
          >
            {tool.scope}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
