"use client";

import { clearSpot } from "./cluster";
import { handleId } from "./handles";
import { useFlowStore } from "./store";
import type { NodeKind } from "./types";

/** The kinds a pinned concept can branch into. */
export type BranchKind = Extract<NodeKind, "image" | "video">;

/** The cluster card's width; the fallback until React Flow has measured the node. */
export const CLUSTER_WIDTH = 380;

// A branched card: rough size for collision checks (see image-node.tsx and
// video-node.tsx), the gap the wire spans, and how far below its top edge its
// text handle sits.
const BRANCH_BOX: Record<BranchKind, { width: number; height: number }> = {
  image: { width: 320, height: 360 },
  video: { width: 360, height: 360 },
};
const BRANCH_GAP = 120;
const TEXT_HANDLE_TOP = 24;

/**
 * Add a node of `kind` to the right of the cluster and wire the pin's text port
 * into its text input. No confirmation step. `handleY` is how far below the
 * cluster's top edge the pin's handle sits, in flow units, so the new node's text
 * handle lines up with it and the wire runs straight across.
 * Returns the new node's id, or null when the cluster no longer exists.
 */
export function branchFromPin(
  kind: BranchKind,
  clusterId: string,
  pinId: string,
  handleY: number = TEXT_HANDLE_TOP
): string | null {
  const { nodes, addNode, onConnect } = useFlowStore.getState();
  const self = nodes.find((n) => n.id === clusterId);
  if (!self) return null;
  const box = BRANCH_BOX[kind];
  const spot = clearSpot(
    {
      x: self.position.x + (self.measured?.width ?? CLUSTER_WIDTH) + BRANCH_GAP,
      y: self.position.y + handleY - TEXT_HANDLE_TOP,
      ...box,
    },
    nodes.map((n) => ({
      ...n.position,
      width: n.measured?.width ?? box.width,
      height: n.measured?.height ?? box.height,
    }))
  );
  const target = addNode(kind, spot);
  onConnect({
    source: clusterId,
    sourceHandle: handleId(clusterId, "text", pinId),
    target,
    targetHandle: handleId(target, "text"),
  });
  return target;
}
