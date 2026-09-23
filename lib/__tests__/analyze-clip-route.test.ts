import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipAnalysisSchema } from "../clip-schema";
import { breakdownToGraph, validateGraph } from "../flow-doc";
import fixture from "../stubs/clip-analysis.json";

import { POST } from "@/app/api/analyze/clip/route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/analyze/clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );

const clip = { frames: [{ t: 0, dataUrl: "data:image/jpeg;base64,AAAA" }], duration: 4, hasAudio: "unknown" };

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
