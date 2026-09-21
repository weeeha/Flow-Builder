"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Film } from "lucide-react";
import { TypedHandle } from "@/components/handles/typed-handle";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "composition" }>>;

export function CompositionNode({ id, data, selected }: Props) {
  return (
    <BaseNode
      id={id}
      title="Composition"
      status={data.status}
      error={data.error}
      selected={selected}
      width={420}
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="video" style={{ top: 24 }} />
      <TypedHandle id={id} type="target" position={Position.Left} handleType="audio" style={{ top: 56 }} />

      <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
        {data.videoUrl ? (
          <video src={data.videoUrl} controls className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-neutral-300">
            <Film size={28} />
            <span className="text-[11px]">Your generation will appear here</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Track color="#8b5cf6" label="Video" present={Boolean(data.videoUrl)} />
        <Track color="#ec4899" label="Text to Speech" present={Boolean(data.audioUrl)} />
      </div>
    </BaseNode>
  );
}

function Track({
  color,
  label,
  present,
}: {
  color: string;
  label: string;
  present: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-2 rounded-full"
        style={{ background: present ? color : "#e5e7eb" }}
      />
      <div
        className="flex h-6 flex-1 items-center rounded-md px-2 text-[11px] font-medium"
        style={{
          background: present ? `${color}1f` : "#f5f5f5",
          color: present ? color : "#9ca3af",
        }}
      >
        {label}
      </div>
    </div>
  );
}
