import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { landSkeleton, readClip } from "../clip-drop";
import { CLIP_LOG_KEY, clipLogCounts } from "../clip-log";
import { COLUMN_GAP } from "../flow-doc";
import type { SampledClip } from "../frames";
import { useFlowStore } from "../store";
import fixture from "../stubs/clip-analysis.json";
import type { FlowNode } from "../types";

import { POST } from "@/app/api/analyze/clip/route";

// jsdom cannot decode video, so the sampler is the one fake; the route is real.
const sampled: SampledClip = {
  frames: Array.from({ length: 8 }, (_, i) => ({ t: i * 0.85, dataUrl: `data:image/jpeg;base64,FRAME${i}` })),
  duration: 6,
  hasAudio: "unknown",
};
// Reports each frame as it lands, the way sampleFrames does.
const sample = vi.fn(async (_file: File, _n?: number, onFrame?: (frame: SampledClip["frames"][number], i: number) => void) => {
  sampled.frames.forEach((frame, i) => onFrame?.(frame, i));
  return sampled;
});
// Uploads are off unless a test turns them on: no Blob store in a unit test.
const upload = vi.fn(async (_file: File): Promise<string | null> => null);
const revokeObjectURL = vi.fn();
const route = vi.fn(async (url: string, init?: RequestInit): Promise<Response> =>
  POST(new Request(`http://localhost${url}`, init))
);

const file = new File(["not really a video"], "dusk.mp4", { type: "video/mp4" });
const reference = () => useFlowStore.getState().nodes.find((n) => n.type === "reference")!;

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubGlobal("fetch", route);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:http://localhost/dusk", revokeObjectURL }));
  sample.mockClear();
  upload.mockReset().mockResolvedValue(null);
  revokeObjectURL.mockClear();
  localStorage.removeItem(CLIP_LOG_KEY);
  route.mockClear();
  useFlowStore.setState({ nodes: [], edges: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readClip", () => {
  it("drops a reference node at the point, then lands the analysed graph beside it", async () => {
    const existing = useFlowStore.getState().addNode("image", { x: -900, y: 0 });
    await readClip(file, { x: 100, y: 200 }, { sample, upload, revealMs: 0 });

    const ref = reference();
    expect(ref.position).toEqual({ x: 100, y: 200 });
    expect(ref.data).toMatchObject({
      status: "done",
      clipUrl: "blob:http://localhost/dusk",
      outputUrl: "blob:http://localhost/dusk",
      // Only three are kept on the node; all eight went to the analysis.
      frames: [sampled.frames[0], sampled.frames[4], sampled.frames[7]],
      duration: 6,
      hasAudio: "unknown",
      summary: fixture.breakdown.summary,
      path: "first pass",
    });

    const { nodes, edges } = useFlowStore.getState();
    expect(nodes).toHaveLength(2 + fixture.graph.nodes.length);
    expect(edges).toHaveLength(fixture.graph.edges.length);
    expect(nodes.find((n) => n.id === existing)?.position).toEqual({ x: -900, y: 0 });
    const image = nodes.find((n) => n.type === "image" && n.id !== existing)!;
    expect(image.position).toEqual({ x: 100 + COLUMN_GAP, y: 200 });

    expect(sample).toHaveBeenCalledWith(file, 8, expect.any(Function));
    expect(clipLogCounts().stub).toBe(1);
    const sent = JSON.parse(route.mock.calls[0][1]!.body as string);
    expect(sent).toEqual(sampled);
  });

  it("slides the reference card below a card it was dropped onto", async () => {
    const existing = useFlowStore.getState().addNode("image", { x: 90, y: 180 });
    await readClip(file, { x: 100, y: 200 }, { sample, upload, revealMs: 0 });
    const ref = reference().position;
    expect(ref.x).toBe(100);
    // The image card has no measured size in jsdom, so its 360px fallback height counts.
    expect(ref.y).toBeGreaterThanOrEqual(180 + 360);
    expect(useFlowStore.getState().nodes.find((n) => n.id === existing)?.position).toEqual({ x: 90, y: 180 });
  });

  it("slides the graph below a card sitting where it would land", async () => {
    const blocker = useFlowStore.getState().addNode("video", { x: 100 + 2 * COLUMN_GAP, y: 250 });
    await readClip(file, { x: 100, y: 200 }, { sample, upload, revealMs: 0 });
    const graph = useFlowStore.getState().nodes.filter((n) => n.type !== "reference" && n.id !== blocker);
    const top = Math.min(...graph.map((n) => n.position.y));
    // The graph's first row starts below the blocker instead of at the drop's y.
    expect(top).toBeGreaterThanOrEqual(250 + 360);
    expect(Math.min(...graph.map((n) => n.position.x))).toBe(100 + COLUMN_GAP);
  });

  it("counts sampled frames and fills the kept thumbnails as each one lands", async () => {
    const steps: { sampled?: number; frames: number }[] = [];
    const stop = useFlowStore.subscribe((state) => {
      const ref = state.nodes.find((n) => n.type === "reference");
      if (ref?.type === "reference" && ref.data.status === "running") {
        steps.push({ sampled: ref.data.sampled, frames: ref.data.frames.length });
      }
    });
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    stop();
    const counts = [...new Set(steps.map((s) => s.sampled))];
    expect(counts).toEqual([undefined, 1, 2, 3, 4, 5, 6, 7, 8]);
    // Frames 0, 4 and 7 are the kept ones: the strip grows at 1, 5 and 8.
    expect(steps.find((s) => s.sampled === 1)?.frames).toBe(1);
    expect(steps.find((s) => s.sampled === 4)?.frames).toBe(1);
    expect(steps.find((s) => s.sampled === 5)?.frames).toBe(2);
    expect(steps.find((s) => s.sampled === 8)?.frames).toBe(3);
  });

  it("logs nothing when the read fails", async () => {
    sample.mockRejectedValueOnce(new Error("nope"));
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(localStorage.getItem(CLIP_LOG_KEY)).toBeNull();
  });

  it("turns away a file that is not a video before reading it", async () => {
    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    await readClip(text, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data.status).toBe("error");
    expect(reference().data.error).toBe("notes.txt is not a video. Drop an .mp4, .mov or .webm clip.");
    expect(sample).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("swaps the session URL for the stored one once the upload lands", async () => {
    const stored = "https://store.public.blob.vercel-storage.com/clips/dusk-a1b2.mp4";
    upload.mockResolvedValueOnce(stored);
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });

    expect(upload).toHaveBeenCalledWith(file);
    expect(reference().data).toMatchObject({ status: "done", clipUrl: stored, outputUrl: stored });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/dusk");
  });

  it("keeps the session URL when uploads are off, and still reads the clip", async () => {
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data).toMatchObject({ status: "done", clipUrl: "blob:http://localhost/dusk" });
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("stores the clip even when the read fails, so a retry has it", async () => {
    const stored = "https://store.public.blob.vercel-storage.com/clips/dusk-a1b2.mp4";
    upload.mockResolvedValueOnce(stored);
    sample.mockRejectedValueOnce(new Error("nope"));
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data).toMatchObject({ status: "error", clipUrl: stored });
  });

  it("marks a clip read only in part", async () => {
    sample.mockResolvedValueOnce({ ...sampled, duration: 130, trimmed: true });
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data).toMatchObject({ duration: 130, trimmed: true, status: "done" });
  });

  it("offers an empty image-into-video skeleton when the analysis fails, and lands it on request", async () => {
    route.mockResolvedValueOnce(Response.json({ error: "Analysis failed: gateway timeout" }, { status: 502 }));
    const id = await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data).toMatchObject({ status: "error", error: "Analysis failed: gateway timeout", offerSkeleton: true });

    await landSkeleton(id, { revealMs: 0 });
    const { nodes, edges } = useFlowStore.getState();
    expect(nodes.map((n) => n.type).sort()).toEqual(["image", "reference", "video"]);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceHandle).toMatch(/:image$/);
    expect(edges[0].targetHandle).toMatch(/:image$/);
    expect(reference().data).toMatchObject({ status: "done", path: "fallback", offerSkeleton: false, error: undefined });
    expect(clipLogCounts().real.fallback).toBe(1);
  });

  it("does not offer the skeleton when the clip itself could not be read", async () => {
    sample.mockRejectedValueOnce(new Error("Could not read this file as a video"));
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data.offerSkeleton).toBeFalsy();
  });

  it("shows a failed read on the reference node and lands no graph", async () => {
    sample.mockRejectedValueOnce(new Error("Could not read this file as a video"));
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data.status).toBe("error");
    expect(reference().data.error).toBe("Could not read this file as a video");
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(route).not.toHaveBeenCalled();
  });

  it("shows a failed analysis the same way", async () => {
    route.mockResolvedValueOnce(Response.json({ error: "No frames to read" }, { status: 400 }));
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    expect(reference().data.status).toBe("error");
    expect(reference().data.error).toBe("No frames to read");
    expect(useFlowStore.getState().nodes).toHaveLength(1);
  });
});

describe("readClip beside work still in flight", () => {
  // Card sizes as Chrome draws them. A reference card is 336px tall while it
  // reads and with a one-line summary; a four-line summary takes it to 385px.
  const LONG_SUMMARY =
    "1 static shot of a colour test pattern: bars, a sweeping clock hand and a frame counter over a grey field, no camera move, even studio light";
  const CARD = {
    image: { width: 320, height: 319 },
    video: { width: 360, height: 342 },
    composition: { width: 420, height: 368 },
    tts: { width: 320, height: 194 },
  } as const;
  const sizeOf = (node: FlowNode) =>
    node.type === "reference"
      ? { width: 320, height: node.data.summary === LONG_SUMMARY ? 385 : 336 }
      : CARD[node.type as keyof typeof CARD];

  /** Measures every card whenever the store changes, as React Flow does once a card renders. */
  const measure = () =>
    useFlowStore.subscribe((state) => {
      const stale = state.nodes.some((n) => n.measured?.height !== sizeOf(n).height);
      if (stale) useFlowStore.setState({ nodes: state.nodes.map((n) => ({ ...n, measured: sizeOf(n) })) });
    });

  /** Every pair of cards that overlap as drawn. */
  const overlaps = () => {
    const boxes = useFlowStore.getState().nodes.map((n) => ({ id: n.id, ...n.position, ...sizeOf(n) }));
    return boxes.flatMap((a, i) =>
      boxes
        .slice(i + 1)
        .filter((b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height)
        .map((b) => `${a.id}/${b.id}`)
    );
  };

  /**
   * Holds the next `count` analyses until each gate opens, the way a slow model
   * keeps a clip reading; the real route answers once it does.
   */
  const holdAnalyses = (count: number, summary?: string) => {
    const gates: (() => void)[] = [];
    for (let i = 0; i < count; i++) {
      route.mockImplementationOnce(async (url, init) => {
        await new Promise<void>((open) => gates.push(open));
        const res = await POST(new Request(`http://localhost${url}`, init));
        if (!summary) return res;
        const body = await res.json();
        return Response.json({ ...body, breakdown: { ...body.breakdown, summary } });
      });
    }
    return gates;
  };

  /** Advance fake time a millisecond at a time until `done` holds. */
  const settle = async (done: () => boolean) => {
    for (let i = 0; i < 1000 && !done(); i++) await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  };

  it("plans a new card at the height it reaches, clear of a card just below the drop", async () => {
    const stop = measure();
    const below = useFlowStore.getState().addNode("image", { x: 0, y: 300 });
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 0 });
    stop();
    expect(overlaps()).toEqual([]);
    expect(useFlowStore.getState().nodes.find((n) => n.id === below)?.position).toEqual({ x: 0, y: 300 });
  });

  it("leaves room below a card still reading for what its answer adds", async () => {
    const stop = measure();
    const existing = useFlowStore.getState().addNode("image", { x: -600, y: 0 });
    const gates = holdAnalyses(2, LONG_SUMMARY);
    // Both dropped onto the middle of the card already there.
    const at = { x: -440, y: 160 };
    const first = readClip(file, at, { sample, upload, revealMs: 0 });
    await vi.waitFor(() => expect(gates).toHaveLength(1));
    const second = readClip(file, at, { sample, upload, revealMs: 0 });
    await vi.waitFor(() => expect(gates).toHaveLength(2));
    gates[0]();
    await first;
    gates[1]();
    await second;
    stop();

    const refs = useFlowStore.getState().nodes.filter((n) => n.type === "reference");
    expect(refs.map((r) => r.measured?.height)).toEqual([385, 385]);
    expect(overlaps()).toEqual([]);
    expect(useFlowStore.getState().nodes.find((n) => n.id === existing)?.position).toEqual({ x: -600, y: 0 });
  });

  it("keeps the spots of a graph still landing from a graph that lands meanwhile", async () => {
    vi.useFakeTimers();
    const stop = measure();
    const gates = holdAnalyses(2);
    const graphCards = () => useFlowStore.getState().nodes.filter((n) => n.type !== "reference").length;
    const first = readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 150 });
    await settle(() => gates.length === 1);
    const second = readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 150 });
    await settle(() => gates.length === 2);
    // The second clip's answer comes back first and its graph starts landing...
    gates[1]();
    await settle(() => graphCards() === 1);
    // ...and the first clip's graph is placed before the rest of it has landed.
    gates[0]();
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    stop();
    vi.useRealTimers();

    expect(graphCards()).toBe(2 * fixture.graph.nodes.length);
    expect(overlaps()).toEqual([]);
  });
});

describe("readClip's reveal", () => {
  /** Every distinct (nodes, edges) count the store passes through during a drop. */
  const watch = () => {
    const seen: { nodes: number; edges: number; dangling: number }[] = [];
    const stop = useFlowStore.subscribe((state) => {
      const ids = new Set(state.nodes.map((n) => n.id));
      const dangling = state.edges.filter((e) => !ids.has(e.source) || !ids.has(e.target)).length;
      const last = seen.at(-1);
      if (!last || last.nodes !== state.nodes.length || last.edges !== state.edges.length) {
        seen.push({ nodes: state.nodes.length, edges: state.edges.length, dangling });
      }
    });
    return { seen, stop };
  };

  it("lands the graph one node per step, left to right, with each edge once both ends exist", async () => {
    vi.useFakeTimers();
    const { seen, stop } = watch();
    const done = readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 150 });
    await vi.runAllTimersAsync();
    await done;
    stop();
    vi.useRealTimers();

    const graphSteps = seen.filter((s) => s.nodes > 1).map((s) => s.nodes);
    expect(graphSteps).toEqual([2, 3, 4, 5]);
    expect(seen.every((s) => s.dangling === 0)).toBe(true);
    expect(seen.at(-1)!.edges).toBe(fixture.graph.edges.length);
    const graph = useFlowStore.getState().nodes.filter((n) => n.type !== "reference");
    const xs = graph.map((n) => n.position.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("lands everything at once when reduced motion is on", async () => {
    const { seen, stop } = watch();
    await readClip(file, { x: 0, y: 0 }, { sample, upload, revealMs: 150, reducedMotion: true });
    stop();
    expect(seen.filter((s) => s.nodes > 1).map((s) => s.nodes)).toEqual([5]);
  });
});
