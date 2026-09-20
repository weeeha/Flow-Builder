"use client";

import { useEffect } from "react";
import { Position, useUpdateNodeInternals, type NodeProps } from "@xyflow/react";
import { ImagePlus, Pin, Shuffle, Sparkles } from "lucide-react";
import { TypedHandle } from "@/components/handles/typed-handle";
import { MAX_PINS, clearSpot, toOutputTexts, togglePin } from "@/lib/cluster";
import { gatherInputs, runSingleNode } from "@/lib/executor";
import { handleId } from "@/lib/handles";
import { DEFAULT_LLM_MODEL, llmModelLabel } from "@/lib/models";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { ClusterGroup, FlowNode } from "@/lib/types";
import { BaseNode } from "./base-node";
import { WirePreview } from "./wire-preview";

type Props = NodeProps<Extract<FlowNode, { type: "cluster" }>>;
type Suggestion = ClusterGroup["suggestions"][number];

const WIDTH = 380;
const SKELETON_GROUPS = 4;
const CHIPS_PER_GROUP = 3;

// A branched Image node: rough size for collision checks, the gap the wire spans,
// and how far below its top edge its text handle sits (see image-node.tsx).
const BRANCH_BOX = { width: 320, height: 360 };
const BRANCH_GAP = 120;
const TEXT_HANDLE_TOP = 24;

// Nothing else in the app has a :focus-visible style yet, so the chips bring their own.
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const pulse = "animate-pulse bg-neutral-100 motion-reduce:animate-none";

export function ClusterNode({ id, data, selected }: Props) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const hasWiredSeed = useFlowStore(
    (s) => gatherInputs(id, s.nodes, s.edges).texts.length > 0
  );
  const updateNodeInternals = useUpdateNodeInternals();

  const running = data.status === "running";
  const hasSeed = Boolean(data.prompt.trim()) || hasWiredSeed;
  const pinnedIds = new Set(data.pinned.map((p) => p.id));
  const atCap = data.pinned.length >= MAX_PINS;
  const chipCount = data.groups.reduce((n, g) => n + g.suggestions.length, 0);
  const model = llmModelLabel(DEFAULT_LLM_MODEL);

  // A pin adds a handle, an unpin removes one, and a re-roll moves them as chips
  // reflow. React Flow re-measures handles on its own only when the node's outer
  // size changes, so it is told after every change that can create or move one.
  const layoutKey = [
    data.status,
    ...data.pinned.map((p) => p.id),
    ...data.groups.flatMap((g) => g.suggestions.map((s) => s.id)),
  ].join(" ");
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, layoutKey, updateNodeInternals]);

  const onTogglePin = (group: ClusterGroup, suggestion: Suggestion) => {
    const next = togglePin(data.pinned, suggestion, group.axis);
    if (next === data.pinned) return;
    if (next.length < data.pinned.length) {
      // The handle goes away with the pin, so the wires that left from it go too.
      const handle = handleId(id, "text", suggestion.id);
      const { edges, onEdgesChange } = useFlowStore.getState();
      onEdgesChange(
        edges
          .filter((e) => e.source === id && e.sourceHandle === handle)
          .map((e) => ({ id: e.id, type: "remove" as const }))
      );
    }
    updateNodeData(id, { pinned: next, outputTexts: toOutputTexts(next) });
  };

  // No confirmation step: the new node appears to the right, already wired.
  const branchToImage = (pinId: string, row: HTMLElement | null) => {
    const { nodes, addNode, onConnect } = useFlowStore.getState();
    const self = nodes.find((n) => n.id === id);
    if (!self) return;
    // offsetTop is in flow units whatever the zoom, so the new node's text handle
    // lines up with this chip's handle and the wire runs straight across.
    const handleY = row ? row.offsetTop + row.offsetHeight / 2 : TEXT_HANDLE_TOP;
    const spot = clearSpot(
      {
        x: self.position.x + (self.measured?.width ?? WIDTH) + BRANCH_GAP,
        y: self.position.y + handleY - TEXT_HANDLE_TOP,
        ...BRANCH_BOX,
      },
      nodes.map((n) => ({
        ...n.position,
        width: n.measured?.width ?? BRANCH_BOX.width,
        height: n.measured?.height ?? BRANCH_BOX.height,
      }))
    );
    const target = addNode("image", spot);
    onConnect({
      source: id,
      sourceHandle: handleId(id, "text", pinId),
      target,
      targetHandle: handleId(target, "text"),
    });
  };

  return (
    <BaseNode
      id={id}
      title="Concept Cluster"
      modelLabel={data.stub ? `${model} · stub` : model}
      status={data.status}
      error={data.error}
      selected={selected}
      width={WIDTH}
      runDisabled={!hasSeed}
      footer={
        data.groups.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => runSingleNode(id)}
              disabled={running || !hasSeed}
              className={cn(
                "flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:border-neutral-400 disabled:opacity-50",
                focusRing
              )}
            >
              <Shuffle size={11} aria-hidden />
              Re-roll all
            </button>
            <span className="text-[11px] text-neutral-400">
              {data.pinned.length}/{MAX_PINS} pinned
            </span>
          </>
        )
      }
    >
      <TypedHandle id={id} type="target" position={Position.Left} handleType="text" style={{ top: 24 }} />

      <WirePreview id={id} />

      <textarea
        value={data.prompt}
        onChange={(e) => updateNodeData(id, { prompt: e.target.value })}
        placeholder="A loose prompt, e.g. a lighthouse at dusk"
        rows={2}
        aria-label="Seed prompt"
        className="nodrag w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:border-blue-400"
      />

      <p className="sr-only" role="status">
        {running
          ? "Generating suggestions"
          : chipCount > 0
          ? `${chipCount} suggestions in ${data.groups.length} groups, ${data.pinned.length} pinned`
          : ""}
      </p>

      {data.groups.length === 0 && !running && (
        <p className="mt-2 rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-center text-[11px] leading-relaxed text-neutral-400">
          Type a loose prompt and press Run to get grouped suggestions. Pin one and it
          becomes a text output you can wire into another node.
        </p>
      )}

      {data.groups.length === 0 && running && (
        <div className="mt-2 space-y-2.5" aria-hidden>
          {Array.from({ length: SKELETON_GROUPS }, (_, g) => (
            <div key={g} className="space-y-1">
              <div className={cn("h-2.5 w-14 rounded", pulse)} />
              {Array.from({ length: CHIPS_PER_GROUP }, (_, c) => (
                <div key={c} className={cn("h-8 rounded-lg", pulse)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {data.groups.length > 0 && (
        <div className="mt-2 space-y-2.5" aria-busy={running}>
          {data.groups.map((group) => (
            <div key={group.id} role="group" aria-label={`${group.axis} suggestions`}>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                {group.axis}
                {group.wild && (
                  <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-px normal-case tracking-normal text-amber-700">
                    <Sparkles size={9} aria-hidden />
                    surprising
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {group.suggestions.map((s) => {
                  const pinned = pinnedIds.has(s.id);
                  // A pinned chip stays mounted through a run, or its handle and wire would
                  // drop. A chip being re-rolled keeps its own box, so nothing pinned moves.
                  if (running && !pinned) {
                    return (
                      <li key={s.id} className={cn("rounded-lg", pulse)} aria-hidden>
                        <span className="invisible block border border-transparent px-2 py-1.5 text-[12px] leading-snug">
                          {s.text}
                        </span>
                      </li>
                    );
                  }
                  const blocked = !pinned && atCap;
                  return (
                    <li key={s.id} className="relative flex items-stretch gap-1">
                      <button
                        type="button"
                        aria-pressed={pinned}
                        aria-disabled={blocked || undefined}
                        title={blocked ? `Unpin one first, ${MAX_PINS} is the most` : undefined}
                        onClick={() => onTogglePin(group, s)}
                        className={cn(
                          "flex flex-1 items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] leading-snug transition-colors",
                          focusRing,
                          pinned
                            ? "border-neutral-900 bg-neutral-900 text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
                          blocked && "cursor-not-allowed opacity-50 hover:border-neutral-200"
                        )}
                      >
                        {pinned && <Pin size={11} className="mt-0.5 shrink-0" aria-hidden />}
                        <span>{s.text}</span>
                      </button>
                      {pinned && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => branchToImage(s.id, e.currentTarget.closest("li"))}
                            aria-label={`Send ${group.axis} concept to image node`}
                            className={cn(
                              "flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-700 hover:border-neutral-400",
                              focusRing
                            )}
                          >
                            <ImagePlus size={12} aria-hidden />
                            to image
                          </button>
                          <TypedHandle
                            id={id}
                            type="source"
                            position={Position.Right}
                            handleType="text"
                            port={s.id}
                            style={{ right: -13 }}
                          />
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </BaseNode>
  );
}
