"use client";

import { clearSpot, type Box } from "./cluster";
import type { AnalyzeClipResponse } from "./clip-schema";
import { COLUMN_GAP, layoutGraph, type FlowDoc } from "./flow-doc";
import { pickThumbnails, sampleFrames, type SampledClip } from "./frames";

/** Frames kept on the reference node for its strip. */
const KEPT_FRAMES = 3;
import { buildGraph, useFlowStore } from "./store";
import type { FlowEdge, FlowNode } from "./types";

/** Sizes to plan around before React Flow has measured a card. */
const REFERENCE_SIZE = { width: 320, height: 260 };
const UNMEASURED_SIZE = { width: 360, height: 360 };
/** The widest and tallest card a graph can hold, for its last column and row. */
const LARGEST_CARD = { width: 420, height: 360 };

function boxOf(node: FlowNode): Box {
  return {
    ...node.position,
    width: node.measured?.width ?? UNMEASURED_SIZE.width,
    height: node.measured?.height ?? UNMEASURED_SIZE.height,
  };
}

const REVEAL_MS = 150;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Add a built graph one node at a time, left to right (columns are topological
 * depth, so every input lands before what it feeds), each edge with the node
 * that completes it. All at once under reduced motion or with no delay.
 */
async function reveal(nodes: FlowNode[], edges: FlowEdge[], stepMs: number) {
  const { addGraph } = useFlowStore.getState();
  if (stepMs <= 0) {
    addGraph(nodes, edges);
    return;
  }
  const ordered = [...nodes].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);
  const landed = new Set<string>();
  for (const [i, node] of ordered.entries()) {
    if (i > 0) await wait(stepMs);
    landed.add(node.id);
    const completed = edges.filter(
      (e) => (e.source === node.id || e.target === node.id) && landed.has(e.source) && landed.has(e.target)
    );
    addGraph([node], completed);
  }
}

/** The area a laid-out graph covers, from its origin. */
function footprint(doc: FlowDoc): { width: number; height: number } {
  const at = Object.values(layoutGraph(doc, { x: 0, y: 0 }));
  return {
    width: Math.max(0, ...at.map((p) => p.x)) + LARGEST_CARD.width,
    height: Math.max(0, ...at.map((p) => p.y)) + LARGEST_CARD.height,
  };
}

/**
 * A dropped clip, end to end: a reference node at the drop point, frames
 * sampled from the clip, the analyze route, and the graph it proposes landed
 * one column to the right. Both slide down their column past any card already
 * there (as the cluster's branches do), and nothing already there moves. Every
 * failure shows on the reference node.
 *
 * The options exist for tests: jsdom cannot decode video, and a test wants the
 * reveal fast or its steps visible. The page passes none.
 */
export async function readClip(
  file: File,
  at: { x: number; y: number },
  {
    sample = sampleFrames,
    revealMs = REVEAL_MS,
    reducedMotion = prefersReducedMotion(),
  }: {
    sample?: (file: File) => Promise<SampledClip>;
    revealMs?: number;
    reducedMotion?: boolean;
  } = {}
): Promise<string> {
  const { addReference, updateNodeData, setNodeStatus } = useFlowStore.getState();
  const clipUrl = URL.createObjectURL(file);
  const spot = clearSpot({ ...at, ...REFERENCE_SIZE }, useFlowStore.getState().nodes.map(boxOf));
  const id = addReference(spot, { clipUrl, outputUrl: clipUrl });
  setNodeStatus(id, "running");

  try {
    const clip = await sample(file);
    updateNodeData(id, { ...clip, frames: pickThumbnails(clip.frames, KEPT_FRAMES) });

    const res = await fetch("/api/analyze/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clip),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<AnalyzeClipResponse> & { error?: string };
    if (!res.ok || !body.graph || !body.breakdown) {
      throw new Error(body.error ?? `Analysis failed (${res.status})`);
    }

    const others = useFlowStore.getState().nodes.filter((n) => n.id !== id).map(boxOf);
    const origin = clearSpot({ x: spot.x + COLUMN_GAP, y: spot.y, ...footprint(body.graph) }, others);
    const { nodes, edges } = buildGraph(body.graph, origin);
    await reveal(nodes, edges, reducedMotion ? 0 : revealMs);
    updateNodeData(id, { summary: body.breakdown.summary, path: body.path });
    setNodeStatus(id, "done");
  } catch (err) {
    setNodeStatus(id, "error", (err as Error).message);
  }
  return id;
}

/** The first video file a drag carries, if any. */
export function clipFrom(transfer: DataTransfer | null): File | undefined {
  return [...(transfer?.files ?? [])].find((f) => f.type.startsWith("video/"));
}
