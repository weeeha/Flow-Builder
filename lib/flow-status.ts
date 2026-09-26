import type { NodeStatus } from "./types";
import type { FlowStatus } from "@/components/flow/flow-types";

/**
 * Maps the app's NodeStatus to the Flow Kit's FlowStatus so kit components
 * (MediaSlot, NodeStatusBadge, RunButton, ...) can be driven by the store.
 *
 * Built as a `Record<NodeStatus, FlowStatus>` so adding a new NodeStatus
 * member is a compile error here until this mapping is updated.
 */
const STATUS_MAP: Record<NodeStatus, FlowStatus> = {
  idle: "idle",
  running: "streaming",
  done: "done",
  error: "failed",
};

export function toFlowStatus(status: NodeStatus): FlowStatus {
  return STATUS_MAP[status];
}

/**
 * What a card's MediaSlot shows. The slot draws media only at "done", and a
 * node reloaded with an earlier output sits at "idle", so idle with an output
 * counts as done and the output survives a reload.
 */
export function slotStatus(status: NodeStatus, output?: string): FlowStatus {
  return status === "idle" && output ? "done" : toFlowStatus(status);
}
