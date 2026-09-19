"use client";

import type { NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";

type Props = NodeProps<Extract<FlowNode, { type: "cluster" }>>;

export function ClusterNode({ id, data, selected }: Props) {
  return (
    <BaseNode
      id={id}
      title="Concept Cluster"
      status={data.status}
      error={data.error}
      selected={selected}
    >
      <p className="text-[12px] text-neutral-400">No suggestions yet.</p>
    </BaseNode>
  );
}
