"use client";

import type { NodeProps } from "@xyflow/react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { optionLabel } from "@/lib/node-kinds";
import type { FlowNode, ImageNodeData } from "@/lib/types";
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

      <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
        {data.outputUrl ? (
          <Image
            src={data.outputUrl}
            alt=""
            width={400}
            height={225}
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon size={28} className="text-neutral-300" />
        )}
      </div>

      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Describe the image..."
        rows={3}
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
      />
    </BaseNode>
  );
}
