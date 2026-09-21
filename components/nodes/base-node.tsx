"use client";

import { Loader2, Play, Trash2, AlertCircle } from "lucide-react";
import { runSingleNode } from "@/lib/executor";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/lib/types";

interface BaseNodeProps {
  id: string;
  title: string;
  modelLabel?: string;
  status: NodeStatus;
  error?: string;
  selected?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}

export function BaseNode({
  id,
  title,
  modelLabel,
  status,
  error,
  selected,
  children,
  footer,
  width = 320,
}: BaseNodeProps) {
  const deleteNode = useFlowStore((s) => s.deleteNode);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white shadow-sm transition",
        selected ? "border-blue-400 shadow-md" : "border-neutral-200",
        status === "running" && "ring-2 ring-blue-300 ring-offset-1",
        status === "error" && "ring-2 ring-red-300 ring-offset-1"
      )}
      style={{ width }}
    >
      <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-neutral-500">
        <span>{title}</span>
        {modelLabel && <span className="text-neutral-400">{modelLabel}</span>}
      </div>

      <div className="px-3 py-2">{children}</div>

      {error && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-[11px] text-red-700">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-3">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2">
        <div className="flex items-center gap-2">{footer}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => deleteNode(id)}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Delete node"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => runSingleNode(id)}
            disabled={status === "running"}
            className="flex items-center gap-1 rounded-md bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {status === "running" ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Play size={11} />
            )}
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
