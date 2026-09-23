"use client";

import type { AnalyzeClipResponse } from "./clip-schema";
import { COLUMN_GAP } from "./flow-doc";
import { sampleFrames, type SampledClip } from "./frames";
import { useFlowStore } from "./store";

/**
 * A dropped clip, end to end: a reference node at the drop point, frames
 * sampled from the clip, the analyze route, and the graph it proposes landed
 * one column to the right. Every failure shows on the reference node.
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
  const id = addReference(at, { clipUrl, outputUrl: clipUrl });
  setNodeStatus(id, "running");

  try {
    const clip = await deps.sample(file);
    updateNodeData(id, { ...clip });

    const res = await fetch("/api/analyze/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clip),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<AnalyzeClipResponse> & { error?: string };
    if (!res.ok || !body.graph || !body.breakdown) {
      throw new Error(body.error ?? `Analysis failed (${res.status})`);
    }

    loadGraph(body.graph, { origin: { x: at.x + COLUMN_GAP, y: at.y } });
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
