"use client";

import { Handle, Position, type HandleProps } from "@xyflow/react";
import { handleId, sameHandleType } from "@/lib/handles";
import { useFlowStore } from "@/lib/store";
import { HANDLE_COLORS, type HandleType } from "@/lib/types";

interface TypedHandleProps {
  id: string;
  type: "source" | "target";
  position: Position;
  handleType: HandleType;
  /** Names one of several handles of the same type on a node. Never affects validity. */
  port?: string;
  style?: React.CSSProperties;
}

export function TypedHandle({
  id,
  type,
  position,
  handleType,
  port,
  style,
}: TypedHandleProps) {
  const isValidConnection: HandleProps["isValidConnection"] = (conn) => {
    const nodes = useFlowStore.getState().nodes;
    const fromNode = nodes.find((n) => n.id === conn.source);
    const toNode = nodes.find((n) => n.id === conn.target);
    if (!fromNode || !toNode) return false;
    return sameHandleType(conn.sourceHandle, conn.targetHandle);
  };

  return (
    <Handle
      id={handleId(id, handleType, port)}
      type={type}
      position={position}
      isValidConnection={isValidConnection}
      style={{
        background: HANDLE_COLORS[handleType],
        width: 14,
        height: 14,
        border: "2px solid white",
        ...style,
      }}
    />
  );
}
