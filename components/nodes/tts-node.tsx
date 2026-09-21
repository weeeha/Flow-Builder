"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { MediaSlot } from "@/components/flow/media-slot";
import { NodePrompt } from "@/components/flow/node-prompt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toFlowStatus } from "@/lib/flow-status";
import { useFlowStore } from "@/lib/store";
import type { FlowNode, NodeStatus } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "tts" }>>;

const VOICES = ["Rachel", "Adam", "Alice", "Bella", "Charlie", "Domi"];

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
      title="Text to Speech"
      modelLabel="Eleven Multilingual v2"
      status={data.status}
      error={data.error}
      selected={selected}
      width={320}
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="text" />
      <TypedHandle id={id} type="source" position={Position.Right} handleType="audio" />

      <WirePreview id={id} />

      <MediaSlot kind="audio" status={slotStatus} src={data.outputUrl} className="nodrag mb-2" />

      <Select value={data.voice} onValueChange={(voice) => updateNodeData(id, { voice })}>
        <SelectTrigger size="sm" aria-label="Voice" className="nodrag mb-2 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VOICES.map((v) => (
            <SelectItem key={v} value={v}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
