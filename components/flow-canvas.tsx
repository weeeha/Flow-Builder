"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
} from "@xyflow/react";
import { useFlowStore } from "@/lib/store";
import { ImageNode } from "@/components/nodes/image-node";
import { VideoNode } from "@/components/nodes/video-node";
import { TTSNode } from "@/components/nodes/tts-node";
import { CompositionNode } from "@/components/nodes/composition-node";
import { ClusterNode } from "@/components/nodes/cluster-node";
import { NodeToolbar } from "@/components/node-toolbar";
import { Inspector } from "@/components/inspector";

const nodeTypes: NodeTypes = {
  image: ImageNode,
  video: VideoNode,
  tts: TTSNode,
  composition: CompositionNode,
  cluster: ClusterNode,
};

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
