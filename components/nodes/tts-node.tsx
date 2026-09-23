"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { NodePrompt } from "@/components/flow/node-prompt";
import { toFlowStatus } from "@/lib/flow-status";
import { optionLabel } from "@/lib/node-kinds";
import { useFlowStore } from "@/lib/store";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "tts" }>>;

export function TTSNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  // MediaSlot only renders media once status is "done". A node freshly loaded
  // from a reload (or otherwise sitting at "idle") with a prior outputUrl still
  // needs to show it, so idle-with-output is treated as done for the slot.
  const slotStatus =
    data.status === "idle" && data.outputUrl ? "done" : toFlowStatus(data.status);

  // The text is the content here and gets re-edited often, so it never collapses
  // to a one-line summary (Nick, 2026-09-23).
  return (
    <BaseNode
      id={id}
      kind="tts"
      modelLabel={optionLabel("tts", "model", data.model)}
      status={data.status}
      error={data.error}
      selected={selected}
      width={320}
    >

      <WirePreview id={id} />

      <MediaSlot kind="audio" status={slotStatus} src={data.outputUrl} className="nodrag mb-2" />

      <NodePrompt
        value={data.prompt}
        onChange={(prompt) => updateNodeData(id, { prompt })}
        placeholder="Type the text to speak..."
        rows={3}
        aria-label="Text to speak"
        className="nodrag"
      />
    </BaseNode>
  );
}
