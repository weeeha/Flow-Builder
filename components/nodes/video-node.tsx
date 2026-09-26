"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { NodePrompt } from "@/components/flow/node-prompt";
import { slotStatus } from "@/lib/flow-status";
import { useFlowStore } from "@/lib/store";
import { videoModelLabel } from "@/lib/models";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "video" }>>;

export function VideoNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  return (
    <BaseNode
      id={id}
      kind="video"
      modelLabel={videoModelLabel(data.model)}
      status={data.status}
      error={data.error}
      selected={selected}
      width={360}
      footer={<span className="text-[11px] text-neutral-400">{data.duration}s</span>}
    >

      <WirePreview id={id} />

      <MediaSlot
        kind="video"
        status={slotStatus(data.status, data.outputUrl)}
        src={data.outputUrl}
        className="nodrag mb-2"
      />

      <NodePrompt
        value={data.prompt}
        onChange={(prompt) => updateNodeData(id, { prompt })}
        placeholder="Describe the video..."
        rows={3}
        aria-label="Video prompt"
        className="nodrag"
      />
    </BaseNode>
  );
}
