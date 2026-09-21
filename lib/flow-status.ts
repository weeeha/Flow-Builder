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
