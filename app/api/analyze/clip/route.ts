import { NextResponse } from "next/server";
import type { AnalyzeClipResponse } from "@/lib/clip-schema";
import type { SampledClip } from "@/lib/frames";
import { hasLlmKey } from "@/lib/llm";
import fixture from "@/lib/stubs/clip-analysis.json";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reads a clip's sampled frames into a shot breakdown plus a node graph. Stub
 * mode (no LLM key) answers from the fixture, which always validates, so its
 * path is "first pass".
 */
export async function POST(req: Request) {
  const clip = (await req.json()) as SampledClip;
  if (!clip.frames?.length) {
    return NextResponse.json({ error: "No frames to read" }, { status: 400 });
  }

  if (!hasLlmKey()) {
    const stub: AnalyzeClipResponse = {
      ...(fixture as Omit<AnalyzeClipResponse, "path" | "stub">),
      path: "first pass",
      stub: true,
    };
    return NextResponse.json(stub);
  }

  // The model call, its repair pass and the local fallback are plan task 9.
  return NextResponse.json(
    { error: "Live clip analysis is not built yet (build 11 task 9). Unset AI_GATEWAY_API_KEY to use the stub." },
    { status: 501 }
  );
}
