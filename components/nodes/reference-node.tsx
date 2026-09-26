"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { landSkeleton } from "@/lib/clip-drop";
import { slotStatus } from "@/lib/flow-status";
import { referenceStatus } from "@/lib/reference-status";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "reference" }>>;

/**
 * A dropped clip: the clip itself, a strip of the frames kept from it, one line
 * on where the read stands, and which path produced the graph. When the clip
 * was read but the analysis failed, it offers an empty image → video instead.
 * The one video output comes from the kind table, drawn by BaseNode.
 */
export function ReferenceNode({ id, data, selected }: Props) {
  const line = referenceStatus(data);

  return (
    <BaseNode
      id={id}
      kind="reference"
      modelLabel={data.path}
      status={data.status}
      error={data.error}
      selected={selected}
      width={320}
    >
      <MediaSlot
        kind="video"
        status={slotStatus(data.status, data.clipUrl)}
        src={data.clipUrl}
        emptyText={line ?? "Reading the clip..."}
        className="nodrag"
      />

      {data.frames.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1" aria-label="Frames from the clip">
          {data.frames.map((frame) => (
            // Data URLs from the page itself; next/image adds nothing for these.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={frame.t}
              src={frame.dataUrl}
              alt={`Frame at ${frame.t.toFixed(1)}s`}
              className="aspect-video w-full rounded object-cover"
            />
          ))}
        </div>
      )}

      <p aria-live="polite" className="mt-2 min-h-4 text-[11px] text-neutral-500">
        {line}
      </p>

      {data.offerSkeleton && (
        <button
          type="button"
          onClick={() => void landSkeleton(id)}
          className="nodrag mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[11px] font-medium text-neutral-700 hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          Start from an empty image → video instead
        </button>
      )}
    </BaseNode>
  );
}
