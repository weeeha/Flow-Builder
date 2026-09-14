"use client";

import { Handle, Position, type HandleProps } from "@xyflow/react";
import { useFlowStore } from "@/lib/store";
import { HANDLE_COLORS, type HandleType } from "@/lib/types";

interface TypedHandleProps {
  id: string;
  type: "source" | "target";
  position: Position;
  handleType: HandleType;
  style?: React.CSSProperties;
}

export function TypedHandle({
  id,
  type,
  position,
  handleType,
  style,
}: TypedHandleProps) {
  const isValidConnection: HandleProps["isValidConnection"] = (conn) => {
    const nodes = useFlowStore.getState().nodes;
    const fromNode = nodes.find((n) => n.id === conn.source);
    const toNode = nodes.find((n) => n.id === conn.target);
    if (!fromNode || !toNode) return false;
    const fromHandle = (conn.sourceHandle ?? "").split(":")[1] as HandleType | undefined;
    const toHandle = (conn.targetHandle ?? "").split(":")[1] as HandleType | undefined;
    return fromHandle === toHandle;
  };

  return (
    <Handle
      id={`${id}:${handleType}`}
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
