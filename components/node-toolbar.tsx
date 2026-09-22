"use client";

import { useReactFlow } from "@xyflow/react";
import { ImageIcon, Video, AudioLines, Layers, Play, Sparkles } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { runAll } from "@/lib/executor";
import { NODE_KINDS, PALETTE_KINDS } from "@/lib/node-kinds";
import type { NodeKind } from "@/lib/types";

// The one thing the kind table cannot hold, because it stays free of React.
// Slice 3 moves this into NODE_VIEWS beside each card; the Record keeps the
// compiler on a new kind until then.
const ICONS: Record<NodeKind, React.ReactNode> = {
  image: <ImageIcon size={18} />,
  video: <Video size={18} />,
  tts: <AudioLines size={18} />,
  composition: <Layers size={18} />,
  cluster: <Sparkles size={18} />,
};

export function NodeToolbar() {
  const addNode = useFlowStore((s) => s.addNode);
  const reactFlow = useReactFlow();

  const handleAdd = (kind: NodeKind) => {
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const id = addNode(kind, {
      x: center.x - 160 + Math.random() * 60,
      y: center.y - 100 + Math.random() * 60,
    });
    setTimeout(() => {
      reactFlow.setCenter(center.x, center.y, { duration: 200 });
      reactFlow.setNodes((nodes) =>
        nodes.map((n) => ({ ...n, selected: n.id === id }))
      );
    }, 0);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-neutral-200 bg-white px-2 py-2 shadow-lg">
        {PALETTE_KINDS.map((kind) => (
          <button
            key={kind}
            onClick={() => handleAdd(kind)}
            title={`Add ${NODE_KINDS[kind].label}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {ICONS[kind]}
          </button>
        ))}
        <div className="mx-1 h-6 w-px bg-neutral-200" />
        <button
          onClick={() => runAll()}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-[12px] font-medium text-white hover:bg-neutral-800"
        >
          <Play size={12} />
          Run all
        </button>
      </div>
    </div>
  );
}
