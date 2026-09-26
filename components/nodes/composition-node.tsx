"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { slotStatus } from "@/lib/flow-status";
import { HANDLE_COLORS, type FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "composition" }>>;

export function CompositionNode({ id, data, selected }: Props) {
  return (
    <BaseNode
      id={id}
      kind="composition"
      status={data.status}
      error={data.error}
      selected={selected}
      width={420}
    >

      <MediaSlot
        kind="video"
        status={slotStatus(data.status, data.videoUrl)}
        src={data.videoUrl}
        className="nodrag mb-2"
      />

      <div className="space-y-1.5">
        <Track color={HANDLE_COLORS.video} label="Video" present={Boolean(data.videoUrl)} />
        <Track color={HANDLE_COLORS.audio} label="Text to Speech" present={Boolean(data.audioUrl)} />
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
