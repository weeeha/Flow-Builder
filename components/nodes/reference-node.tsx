"use client";

import type { NodeProps } from "@xyflow/react";
import { MediaSlot } from "@/components/flow/media-slot";
import { toFlowStatus } from "@/lib/flow-status";
import { referenceStatus } from "@/lib/reference-status";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "reference" }>>;

/**
 * A dropped clip: the clip itself, a strip of the frames kept from it, one line
 * on where the read stands, and which path produced the graph. The one video
 * output comes from the kind table, drawn by BaseNode.
 */
export function ReferenceNode({ id, data, selected }: Props) {
  // As in tts-node: a reloaded node sits at idle with its clip still set.
  const slotStatus = data.status === "idle" && data.clipUrl ? "done" : toFlowStatus(data.status);
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
        status={slotStatus}
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
    </BaseNode>
  );
}
