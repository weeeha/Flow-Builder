import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { ClipAnalysisSchema } from "../clip-schema";
import { breakdownToGraph, validateGraph } from "../flow-doc";
import fixture from "../stubs/clip-analysis.json";

// The model call is the one thing a test cannot make for real.
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi.fn(),
}));

import { POST } from "@/app/api/analyze/clip/route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/analyze/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const clip = {
  frames: Array.from({ length: 8 }, (_, i) => ({ t: i * 0.5, dataUrl: `data:image/jpeg;base64,FRAME${i}` })),
  duration: 4,
  hasAudio: "unknown",
};

const model = vi.mocked(generateText);
const answer = (output: unknown) => ({ output }) as never;
const analysis = ClipAnalysisSchema.parse(fixture);
/** The fixture's graph with its tts wired into the video's text input, a type mismatch. */
const broken = {
  ...analysis,
  graph: {
    ...analysis.graph,
    edges: analysis.graph.edges.map((e) =>
      e.source === "tts-1" ? { ...e, target: "video-1", targetHandle: "video-1:text" } : e
    ),
  },
};

beforeEach(() => {
  model.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the stub fixture", () => {
  it("is a complete ClipAnalysis whose graph passes validateGraph", () => {
    const parsed = ClipAnalysisSchema.parse(fixture);
    expect(validateGraph(parsed.graph)).toEqual([]);
  });

  it("carries the graph the fallback template builds from its own breakdown", () => {
    const parsed = ClipAnalysisSchema.parse(fixture);
    expect(parsed.graph).toEqual(breakdownToGraph(parsed.breakdown, "unknown"));
  });
});

describe("POST /api/analyze/clip", () => {
  it("answers from the fixture as a first pass when no LLM key is set", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const res = await post(clip);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...fixture, path: "first pass", stub: true });
  });

  it("rejects a request with no frames", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const res = await post({ ...clip, frames: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No frames to read");
  });
});

describe("POST /api/analyze/clip with a key", () => {
  beforeEach(() => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  });

  it("returns a valid first answer as a first pass after one call, with every frame sent as an image", async () => {
    model.mockResolvedValueOnce(answer(analysis));
    const res = await post(clip);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...analysis, path: "first pass", stub: false });
    expect(model).toHaveBeenCalledTimes(1);

    const content = model.mock.calls[0][0].messages![0].content as { type: string; mediaType?: string; data?: unknown }[];
    const images = content.filter((part) => part.type === "file");
    expect(images).toHaveLength(8);
    expect(images[0]).toEqual({ type: "file", mediaType: "image/jpeg", data: { type: "data", data: "FRAME0" } });
  });

  it("repairs an invalid graph once, quoting the errors, and labels it repaired", async () => {
    model.mockResolvedValueOnce(answer(broken)).mockResolvedValueOnce(answer({ graph: analysis.graph }));
    const body = await (await post(clip)).json();
    expect(body.path).toBe("repaired");
    expect(body.graph).toEqual(analysis.graph);
    expect(body.breakdown).toEqual(analysis.breakdown);
    expect(model).toHaveBeenCalledTimes(2);
    expect(model.mock.calls[1][0].prompt).toContain("The edge tts-1:audio → video-1:text joins handles that do not fit.");
  });

  it("falls back to the template when the repair is still invalid", async () => {
    model.mockResolvedValueOnce(answer(broken)).mockResolvedValueOnce(answer({ graph: broken.graph }));
    const body = await (await post(clip)).json();
    expect(body.path).toBe("fallback");
    expect(body.graph).toEqual(breakdownToGraph(analysis.breakdown, "unknown"));
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("falls back to the template when the repair call itself fails", async () => {
    model.mockResolvedValueOnce(answer(broken)).mockRejectedValueOnce(new Error("gateway timeout"));
    const body = await (await post(clip)).json();
    expect(body.path).toBe("fallback");
    expect(validateGraph(body.graph)).toEqual([]);
  });

  it("reports a failed first call, since there is no breakdown to fall back on", async () => {
    model.mockRejectedValueOnce(new Error("gateway timeout"));
    const res = await post(clip);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Analysis failed: gateway timeout" });
  });
});
