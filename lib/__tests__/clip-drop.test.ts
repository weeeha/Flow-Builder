import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readClip } from "../clip-drop";
import { COLUMN_GAP } from "../flow-doc";
import type { SampledClip } from "../frames";
import { useFlowStore } from "../store";
import fixture from "../stubs/clip-analysis.json";

import { POST } from "@/app/api/analyze/clip/route";

// jsdom cannot decode video, so the sampler is the one fake; the route is real.
const sampled: SampledClip = {
  frames: [{ t: 0, dataUrl: "data:image/jpeg;base64,AAAA" }],
  duration: 6,
  hasAudio: "unknown",
};
const sample = vi.fn(async () => sampled);
const route = vi.fn(async (url: string, init?: RequestInit): Promise<Response> =>
  POST(new Request(`http://localhost${url}`, init))
);

const file = new File(["not really a video"], "dusk.mp4", { type: "video/mp4" });
const reference = () => useFlowStore.getState().nodes.find((n) => n.type === "reference")!;

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "");
  vi.stubGlobal("fetch", route);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:http://localhost/dusk" }));
  sample.mockClear();
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
    await readClip(file, { x: 100, y: 200 }, { sample });

    const ref = reference();
    expect(ref.position).toEqual({ x: 100, y: 200 });
    expect(ref.data).toMatchObject({
      status: "done",
      clipUrl: "blob:http://localhost/dusk",
      outputUrl: "blob:http://localhost/dusk",
      frames: sampled.frames,
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

    expect(sample).toHaveBeenCalledWith(file);
    const sent = JSON.parse(route.mock.calls[0][1]!.body as string);
    expect(sent).toEqual(sampled);
  });

  it("shows a failed read on the reference node and lands no graph", async () => {
    sample.mockRejectedValueOnce(new Error("Could not read this file as a video"));
    await readClip(file, { x: 0, y: 0 }, { sample });
    expect(reference().data.status).toBe("error");
    expect(reference().data.error).toBe("Could not read this file as a video");
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(route).not.toHaveBeenCalled();
  });

  it("shows a failed analysis the same way", async () => {
    route.mockResolvedValueOnce(Response.json({ error: "No frames to read" }, { status: 400 }));
    await readClip(file, { x: 0, y: 0 }, { sample });
    expect(reference().data.status).toBe("error");
    expect(reference().data.error).toBe("No frames to read");
    expect(useFlowStore.getState().nodes).toHaveLength(1);
  });
});
