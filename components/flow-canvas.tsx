"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { useState, type DragEvent } from "react";
import { clipFrom, readClip } from "@/lib/clip-drop";
import { useFlowStore } from "@/lib/store";
import { nodeTypes } from "@/components/nodes/registry";
import { NodeToolbar } from "@/components/node-toolbar";
import { Inspector } from "@/components/inspector";

function FlowCanvasInner() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);
  const { screenToFlowPosition } = useReactFlow();
  const [dragging, setDragging] = useState(false);

  // Only a drag carrying files is a clip drop; dragging a node or a wire is not.
  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragging(false);
    const file = clipFrom(e.dataTransfer);
    if (!file) return;
    void readClip(file, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  return (
    <div
      className="relative h-full w-full"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{
          type: "default",
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#d4d4d4" />
        <Controls position="bottom-left" />
        <MiniMap pannable zoomable className="!bg-white/80" />
      </ReactFlow>
      <NodeToolbar />
      <Header />
      {dragging && <DropOverlay />}
      <Inspector />
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/70">
      <span className="rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-blue-700 shadow-sm">
        Drop to read the clip
      </span>
    </div>
  );
}

function Header() {
  return (
    <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-[13px] font-semibold">Flows</span>
      <span className="h-4 w-px bg-neutral-200" />
      <span className="text-[13px] text-neutral-600">Untitled flow</span>
    </div>
  );
}

export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
