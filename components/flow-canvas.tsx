"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
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

  return (
    <div className="relative h-full w-full">
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
      <Inspector />
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
