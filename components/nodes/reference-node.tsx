"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { toFlowStatus } from "@/lib/flow-status";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "reference" }>>;

/**
 * A dropped clip. Minimal for now: the clip, and the one video output BaseNode
 * draws from the table. The frame strip, summary and path label are task 11.
 */
export function ReferenceNode({ id, data, selected }: Props) {
  // As in tts-node: a reloaded node sits at idle with its clip still set.
  const slotStatus = data.status === "idle" && data.clipUrl ? "done" : toFlowStatus(data.status);

  return (
    <BaseNode
      id={id}
      kind="reference"
      status={data.status}
      error={data.error}
      selected={selected}
      width={320}
    >
      <MediaSlot
        kind="video"
        status={slotStatus}
        src={data.clipUrl}
        emptyText="Reading the clip..."
        className="nodrag"
      />
    </BaseNode>
  );
}
