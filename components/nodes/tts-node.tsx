"use client";

import type { NodeProps } from "@xyflow/react";
import { useState } from "react";
import { MediaSlot } from "@/components/flow/media-slot";
import { NodePrompt } from "@/components/flow/node-prompt";
import { toFlowStatus } from "@/lib/flow-status";
import { optionLabel } from "@/lib/node-kinds";
import { useFlowStore } from "@/lib/store";
import type { FlowNode, NodeStatus } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "tts" }>>;

// [HAND] Nick decides: when should the prompt collapse to its one-line summary?
// Kit guidance (the Flora pattern): collapse once an output exists, and clicking
// the summary expands it again. Things to weigh: for TTS the text IS the content
// and gets re-edited often; collapsing saves height on a crowded canvas; decide
// whether a new run re-collapses a prompt the user expanded by hand.
// Returning false keeps today's always-open textarea.
function shouldCollapsePrompt(args: {
  status: NodeStatus;
  hasOutput: boolean;
  userExpanded: boolean;
}): boolean {
  void args;
  return false; // TODO(HAND)
}

export function TTSNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const [userExpanded, setUserExpanded] = useState(false);

  // MediaSlot only renders media once status is "done". A node freshly loaded
  // from a reload (or otherwise sitting at "idle") with a prior outputUrl still
  // needs to show it, so idle-with-output is treated as done for the slot.
  const slotStatus =
    data.status === "idle" && data.outputUrl ? "done" : toFlowStatus(data.status);

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
        collapsed={shouldCollapsePrompt({
          status: data.status,
          hasOutput: !!data.outputUrl,
          userExpanded,
        })}
        onExpand={() => setUserExpanded(true)}
        className="nodrag"
      />
    </BaseNode>
  );
}
