import { NextResponse } from "next/server";
import { Output, generateText } from "ai";
import { z } from "zod";
import { ClipAnalysisSchema, type AnalyzeClipResponse, type ClipAnalysis } from "@/lib/clip-schema";
import {
  FlowDocSchema,
  NODE_HANDLES,
  breakdownToGraph,
  validateGraph,
  type FlowDoc,
  type GraphError,
} from "@/lib/flow-doc";
import type { SampledClip } from "@/lib/frames";
import { LLM_MODEL, hasLlmKey } from "@/lib/llm";
import fixture from "@/lib/stubs/clip-analysis.json";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Reads a clip's sampled frames into a shot breakdown plus a node graph. The
 * graph goes through validateGraph; an invalid one gets one repair call quoting
 * the errors, and if that fails too the graph is built locally from the
 * breakdown, so a clip that was read at all always lands a valid graph. Stub
 * mode (no LLM key) answers from the fixture, which always validates.
 */
export async function POST(req: Request) {
  const clip = (await req.json()) as SampledClip;
  if (!clip.frames?.length) {
    return NextResponse.json({ error: "No frames to read" }, { status: 400 });
  }

  if (!hasLlmKey()) {
    return reply(fixture as ClipAnalysis, "first pass", true);
  }

  let analysis: ClipAnalysis;
  try {
    analysis = await readClip(clip);
  } catch (err) {
    // Nothing to fall back on without a breakdown; the client offers a skeleton.
    return NextResponse.json({ error: `Analysis failed: ${message(err)}` }, { status: 502 });
  }

  const errors = validateGraph(analysis.graph);
  if (!errors.length) return reply(analysis, "first pass", false);

  const repaired = await repair(analysis.graph, errors).catch(() => null);
  if (repaired && !validateGraph(repaired).length) {
    return reply({ ...analysis, graph: repaired }, "repaired", false);
  }
  return reply({ ...analysis, graph: breakdownToGraph(analysis.breakdown, clip.hasAudio) }, "fallback", false);
}

function reply(analysis: ClipAnalysis, path: AnalyzeClipResponse["path"], stub: boolean) {
  const body: AnalyzeClipResponse = { ...analysis, path, stub };
  return NextResponse.json(body);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A frame's data URL down to the base64 payload a file part carries. */
const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

async function readClip(clip: SampledClip): Promise<ClipAnalysis> {
  const { output } = await generateText({
    model: LLM_MODEL,
    output: Output.object({ schema: ClipAnalysisSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: instructions(clip) },
          ...clip.frames.map((frame) => ({
            type: "file" as const,
            mediaType: "image/jpeg",
            data: { type: "data" as const, data: base64Of(frame.dataUrl) },
          })),
        ],
      },
    ],
  });
  return output;
}

async function repair(graph: FlowDoc, errors: GraphError[]): Promise<FlowDoc> {
  const { output } = await generateText({
    model: LLM_MODEL,
    output: Output.object({ schema: z.object({ graph: FlowDocSchema }) }),
    prompt: [
      "This node graph for a video editing canvas breaks the rules below.",
      "Return a corrected graph only, keeping every prompt and param you can.",
      "",
      "Problems:",
      ...errors.map((e) => `- ${e.message}`),
      "",
      rules(),
      "",
      "Graph:",
      JSON.stringify(graph),
    ].join("\n"),
  });
  return output.graph;
}

function rules(): string {
  return [
    "Rules:",
    `- Use only these node kinds, with these input and output handle types: ${JSON.stringify(NODE_HANDLES)}.`,
    '- A handle id is "<nodeId>:<type>", for example "image-1:image". No other segments.',
    "- An edge joins an output of the source to an input of the same type on the target.",
    "- Every input except text takes at most one edge. Composition has no outputs. No cycles.",
  ].join("\n");
}

function instructions(clip: SampledClip): string {
  return [
    `These are ${clip.frames.length} frames sampled evenly from a ${clip.duration.toFixed(1)}s video clip, in order.`,
    `Audio present: ${clip.hasAudio}.`,
    "",
    "1. Break the clip into at most three shots. For each, describe the camera and content,",
    "   write an imagePrompt for a still that starts the shot and a videoPrompt that animates it,",
    "   and estimate its duration. Write a short summary like \"1 shot, push-in, dusk\".",
    "2. Propose a node graph that recreates it: per shot an image node wired into a video node",
    "   (image output into the video's image input), the first shot's video into a composition's",
    "   video input, and, when audio is true or unknown, a tts node into the composition's audio",
    '   input. Put the prompts in node data as "prompt"; a video node may also carry "duration".',
    "",
    rules(),
  ].join("\n");
}
