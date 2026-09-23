"use client";

import { clearSpot, type Box } from "./cluster";
import type { AnalyzeClipResponse } from "./clip-schema";
import { COLUMN_GAP, layoutGraph, type FlowDoc } from "./flow-doc";
import { pickThumbnails, sampleFrames, type SampledClip } from "./frames";

/** Frames kept on the reference node for its strip. */
const KEPT_FRAMES = 3;
import { useFlowStore } from "./store";
import type { FlowNode } from "./types";

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
 * `sample` is injectable because jsdom cannot decode video; the page always
 * uses the real sampler.
 */
export async function readClip(
  file: File,
  at: { x: number; y: number },
  deps: { sample: (file: File) => Promise<SampledClip> } = { sample: sampleFrames }
): Promise<string> {
  const { addReference, updateNodeData, setNodeStatus, loadGraph } = useFlowStore.getState();
  const clipUrl = URL.createObjectURL(file);
  const spot = clearSpot({ ...at, ...REFERENCE_SIZE }, useFlowStore.getState().nodes.map(boxOf));
  const id = addReference(spot, { clipUrl, outputUrl: clipUrl });
  setNodeStatus(id, "running");

  try {
    const clip = await deps.sample(file);
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
    loadGraph(body.graph, { origin });
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
