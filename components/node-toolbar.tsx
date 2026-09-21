"use client";

import { useReactFlow } from "@xyflow/react";
import { ImageIcon, Video, AudioLines, Layers, Play } from "lucide-react";
import { useFlowStore } from "@/lib/store";
import { runAll } from "@/lib/executor";
import type { NodeKind } from "@/lib/types";

const NODE_BUTTONS: { kind: NodeKind; label: string; icon: React.ReactNode }[] = [
  { kind: "image", label: "Image", icon: <ImageIcon size={18} /> },
  { kind: "video", label: "Video", icon: <Video size={18} /> },
  { kind: "tts", label: "Text to Speech", icon: <AudioLines size={18} /> },
  { kind: "composition", label: "Composition", icon: <Layers size={18} /> },
];

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
        {NODE_BUTTONS.map((b) => (
          <button
            key={b.kind}
            onClick={() => handleAdd(b.kind)}
            title={`Add ${b.label}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {b.icon}
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
