"use client";

import { clearSpot, type Box } from "./cluster";
import type { AnalyzeClipResponse } from "./clip-schema";
import { COLUMN_GAP, layoutGraph, type FlowDoc } from "./flow-doc";
import { recordClipRun } from "./clip-log";
import { uploadClip } from "./clip-upload";
import { FRAME_COUNT, pickThumbnails, sampleFrames, type SampledClip, type SampledFrame } from "./frames";

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
 * The clip uploads to Blob storage while it is read, when uploads are on. Once
 * stored, the card and everything wired to it hold a URL that survives a
 * reload and that a provider can fetch; until then, a session-only object URL.
 *
 * The options exist for tests: jsdom cannot decode video or reach Blob, and a
 * test wants the reveal fast or its steps visible. The page passes none.
 */
export async function readClip(
  file: File,
  at: { x: number; y: number },
  {
    sample = sampleFrames,
    upload = uploadClip,
    revealMs = REVEAL_MS,
    reducedMotion = prefersReducedMotion(),
  }: {
    sample?: (file: File, n: number, onFrame: (frame: SampledFrame, index: number) => void) => Promise<SampledClip>;
    upload?: (file: File) => Promise<string | null>;
    revealMs?: number;
    reducedMotion?: boolean;
  } = {}
): Promise<string> {
  const { addReference, updateNodeData, setNodeStatus } = useFlowStore.getState();
  const isVideo = file.type.startsWith("video/");
  const clipUrl = isVideo ? URL.createObjectURL(file) : undefined;
  const spot = clearSpot({ ...at, ...REFERENCE_SIZE }, useFlowStore.getState().nodes.map(boxOf));
  const id = addReference(spot, { clipUrl, outputUrl: clipUrl });
  if (!isVideo) {
    setNodeStatus(id, "error", `${file.name} is not a video. Drop an .mp4, .mov or .webm clip.`);
    return id;
  }
  setNodeStatus(id, "running");

  const stored = upload(file).then((url) => {
    if (!url) return;
    updateNodeData(id, { clipUrl: url, outputUrl: url });
    URL.revokeObjectURL(clipUrl!);
  });

  let clip: SampledClip;
  try {
    // Which of the frames the strip keeps is known before any arrive, so each
    // kept one shows as soon as it is read.
    const keptIndexes = new Set(
      pickThumbnails(Array.from({ length: FRAME_COUNT }, (_, i) => ({ t: i, dataUrl: "" })), KEPT_FRAMES).map((f) => f.t)
    );
    const strip: SampledFrame[] = [];
    clip = await sample(file, FRAME_COUNT, (frame, i) => {
      if (keptIndexes.has(i)) strip.push(frame);
      updateNodeData(id, { sampled: i + 1, frames: [...strip] });
    });
    updateNodeData(id, { ...clip, frames: pickThumbnails(clip.frames, KEPT_FRAMES) });
  } catch (err) {
    setNodeStatus(id, "error", (err as Error).message);
    await stored;
    return id;
  }

  try {
    const res = await fetch("/api/analyze/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clip),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<AnalyzeClipResponse> & { error?: string };
    if (!res.ok || !body.graph || !body.breakdown || !body.path) {
      throw new Error(body.error ?? `Analysis failed (${res.status})`);
    }
    await landBeside(id, body.graph, reducedMotion ? 0 : revealMs);
    updateNodeData(id, { summary: body.breakdown.summary, path: body.path, sampled: undefined });
    recordClipRun({ path: body.path, stub: Boolean(body.stub) });
    setNodeStatus(id, "done");
  } catch (err) {
    // The clip was read, so there is something to start from: offer the skeleton.
    updateNodeData(id, { sampled: undefined, offerSkeleton: true });
    setNodeStatus(id, "error", (err as Error).message);
  }
  await stored;
  return id;
}

/** A graph laid out one column right of a reference card, slid clear of other cards. */
async function landBeside(referenceId: string, doc: FlowDoc, revealMs: number) {
  const nodes = useFlowStore.getState().nodes;
  const ref = nodes.find((n) => n.id === referenceId);
  if (!ref) return;
  const others = nodes.filter((n) => n.id !== referenceId).map(boxOf);
  const origin = clearSpot(
    { x: ref.position.x + COLUMN_GAP, y: ref.position.y, ...footprint(doc) },
    others
  );
  const built = buildGraph(doc, origin);
  await reveal(built.nodes, built.edges, revealMs);
}

/** What a failed analysis can still start from: one image into one video. */
const SKELETON: FlowDoc = {
  version: 1,
  nodes: [
    { id: "image-1", kind: "image", data: {} },
    { id: "video-1", kind: "video", data: {} },
  ],
  edges: [{ source: "image-1", sourceHandle: "image-1:image", target: "video-1", targetHandle: "video-1:image" }],
};

/**
 * Land the empty skeleton beside a reference card whose analysis failed. Logged
 * as a fallback, since the model produced nothing usable.
 */
export async function landSkeleton(
  referenceId: string,
  { revealMs = REVEAL_MS, reducedMotion = prefersReducedMotion() }: { revealMs?: number; reducedMotion?: boolean } = {}
): Promise<void> {
  const { updateNodeData, setNodeStatus } = useFlowStore.getState();
  updateNodeData(referenceId, { offerSkeleton: false });
  await landBeside(referenceId, SKELETON, reducedMotion ? 0 : revealMs);
  updateNodeData(referenceId, { path: "fallback" });
  recordClipRun({ path: "fallback", stub: false });
  setNodeStatus(referenceId, "done", undefined);
}

/** The first file a drag carries. A non-video one is turned away on the card. */
export function clipFrom(transfer: DataTransfer | null): File | undefined {
  return transfer?.files?.[0];
}
