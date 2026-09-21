"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Video as VideoIcon } from "lucide-react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { useFlowStore } from "@/lib/store";
import type { FlowNode, VideoNodeData } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "video" }>>;

export function VideoNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  return (
    <BaseNode
      id={id}
      title="Video"
      modelLabel={data.model}
      status={data.status}
      error={data.error}
      selected={selected}
      width={360}
      footer={
        <select
          value={data.duration}
          onChange={(e) =>
            updateNodeData(id, { duration: Number(e.target.value) as VideoNodeData["duration"] })
          }
          className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px]"
        >
          <option value={4}>4s</option>
          <option value={6}>6s</option>
          <option value={8}>8s</option>
        </select>
      }
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="text" style={{ top: 24 }} />
      <TypedHandle id={id} type="target" position={Position.Left} handleType="image" style={{ top: 56 }} />
      <TypedHandle id={id} type="source" position={Position.Right} handleType="video" />

      <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
        {data.outputUrl ? (
          <video
            src={data.outputUrl}
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <VideoIcon size={28} className="text-neutral-300" />
        )}
      </div>

      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Describe the video..."
        rows={3}
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
      />
    </BaseNode>
  );
}
