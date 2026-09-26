"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { NodePrompt } from "@/components/flow/node-prompt";
import { slotStatus } from "@/lib/flow-status";
import { useFlowStore } from "@/lib/store";
import { optionLabel } from "@/lib/node-kinds";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "image" }>>;

export function ImageNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  return (
    <BaseNode
      id={id}
      kind="image"
      modelLabel={optionLabel("image", "model", data.model)}
      status={data.status}
      error={data.error}
      selected={selected}
    >

      <WirePreview id={id} />

      <MediaSlot
        kind="image"
        status={slotStatus(data.status, data.outputUrl)}
        src={data.outputUrl}
        alt={data.prompt}
        className="nodrag mb-2"
      />

      <NodePrompt
        value={data.prompt}
        onChange={(prompt) => updateNodeData(id, { prompt })}
        placeholder="Describe the image..."
        rows={3}
        aria-label="Image prompt"
        className="nodrag"
      />
    </BaseNode>
  );
}
