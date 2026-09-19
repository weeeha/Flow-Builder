"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { AudioLines, Pause, Play } from "lucide-react";
import { useRef, useState } from "react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { useFlowStore } from "@/lib/store";
import type { FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "tts" }>>;

const VOICES = ["Rachel", "Adam", "Alice", "Bella", "Charlie", "Domi"];

export function TTSNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  };

  return (
    <BaseNode
      id={id}
      title="Text to Speech"
      modelLabel="Eleven Multilingual v2"
      status={data.status}
      error={data.error}
      selected={selected}
      width={320}
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="text" />
      <TypedHandle id={id} type="source" position={Position.Right} handleType="audio" />

      <WirePreview id={id} />

      <div className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-2">
        <button
          type="button"
          onClick={toggle}
          disabled={!data.outputUrl}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white disabled:opacity-40"
        >
          {playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
        </button>
        <div className="flex h-6 flex-1 items-center gap-px overflow-hidden">
          {data.outputUrl ? (
            <div className="flex h-full w-full items-center gap-px">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-full bg-neutral-300"
                  style={{ height: `${20 + (i * 17) % 70}%` }}
                />
              ))}
            </div>
          ) : (
            <AudioLines size={16} className="text-neutral-300" />
          )}
        </div>
        {data.outputUrl && (
          <audio
            ref={audioRef}
            src={data.outputUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
      </div>

      <select
        value={data.voice}
        onChange={(e) => updateNodeData(id, { voice: e.target.value })}
        className="mb-2 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px]"
      >
        {VOICES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="Type the text to speak..."
        rows={3}
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
      />
    </BaseNode>
  );
}
