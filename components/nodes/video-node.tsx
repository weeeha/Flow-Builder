"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { Video as VideoIcon } from "lucide-react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { useFlowStore } from "@/lib/store";
import {
  PROVIDERS,
  PROVIDER_LABELS,
  VIDEO_MODELS,
  videoModelLabel,
} from "@/lib/models";
import type { FlowNode, VideoModelId, VideoNodeData } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "video" }>>;

const selectClass =
  "rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px]";

export function VideoNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);

  return (
    <BaseNode
      id={id}
      title="Video"
      modelLabel={videoModelLabel(data.model)}
      status={data.status}
      error={data.error}
      selected={selected}
      width={360}
      footer={
        <>
          <select
            value={data.model}
            onChange={(e) =>
              updateNodeData(id, { model: e.target.value as VideoModelId })
            }
            className={selectClass}
            aria-label="Video model"
          >
            {PROVIDERS.map((provider) => (
              <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
                {VIDEO_MODELS.filter((m) => m.provider === provider).map((m) => (
                  <option key={m.id} value={m.id} title={m.note}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={data.duration}
            onChange={(e) =>
              updateNodeData(id, {
                duration: Number(e.target.value) as VideoNodeData["duration"],
              })
            }
            className={selectClass}
            aria-label="Duration"
          >
            <option value={4}>4s</option>
            <option value={6}>6s</option>
            <option value={8}>8s</option>
          </select>
        </>
      }
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="text" style={{ top: 24 }} />
      <TypedHandle id={id} type="target" position={Position.Left} handleType="image" style={{ top: 56 }} />
      <TypedHandle id={id} type="source" position={Position.Right} handleType="video" />

      <WirePreview id={id} />

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
