"use client";

import { Position } from "@xyflow/react";
import { Loader2, Play, Trash2, AlertCircle } from "lucide-react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { runSingleNode } from "@/lib/executor";
import { NODE_KINDS, shellPorts } from "@/lib/node-kinds";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { NodeKind, NodeStatus } from "@/lib/types";

interface BaseNodeProps {
  id: string;
  /** Names the card and supplies its ports, both read from NODE_KINDS. */
  kind: NodeKind;
  modelLabel?: string;
  status: NodeStatus;
  error?: string;
  selected?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Keeps Run off until the node has what it needs. Defaults to never. */
  runDisabled?: boolean;
}

export function BaseNode({
  id,
  kind,
  modelLabel,
  status,
  error,
  selected,
  children,
  footer,
  width = 320,
  runDisabled = false,
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
      {shellPorts(kind).map((p) => (
        <TypedHandle
          key={`${p.side}:${p.type}:${p.port ?? ""}`}
          id={id}
          type={p.side}
          position={p.side === "target" ? Position.Left : Position.Right}
          handleType={p.type}
          port={p.port}
          style={p.top === undefined ? undefined : { top: p.top }}
        />
      ))}

      <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-neutral-500">
        <span>{NODE_KINDS[kind].label}</span>
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
            disabled={status === "running" || runDisabled}
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
