import { z } from "zod";
import { FlowDocSchema } from "./flow-doc";

/**
 * What the analyze route returns for a clip: a shot breakdown plus a node graph
 * approximating it. One combined answer, so a repair costs one extra round trip.
 */

export const ShotBreakdownSchema = z.object({
  shotType: z.enum([
    "wide",
    "medium",
    "close_up",
    "extreme_close_up",
    "aerial",
    "pov",
    "tracking",
    "insert",
    "establishing",
    "other",
  ]),
  cameraAngle: z.string(),
  cameraMovement: z.string(),
  composition: z.string(),
  subject: z.string(),
  action: z.string(),
  emotionalIntent: z.string(),
  visualStyleNotes: z.string().optional(),
  imagePrompt: z.string(),
  videoPrompt: z.string(),
  durationEstimateSeconds: z.number(),
  tStart: z.number(),
  tEnd: z.number(),
});

export const ClipBreakdownSchema = z.object({
  /** "1 shot, push-in, dusk", written by the model rather than derived. */
  summary: z.string(),
  shots: z.array(ShotBreakdownSchema).min(1).max(3),
});
export type ClipBreakdown = z.infer<typeof ClipBreakdownSchema>;

export const ClipAnalysisSchema = z.object({
  breakdown: ClipBreakdownSchema,
  graph: FlowDocSchema,
});
export type ClipAnalysis = z.infer<typeof ClipAnalysisSchema>;

/** Which path produced the graph. Stub mode is always "first pass". */
export type ClipPath = "first pass" | "repaired" | "fallback";

/** The route's answer: the analysis plus where it came from. */
export type AnalyzeClipResponse = ClipAnalysis & { path: ClipPath; stub: boolean };
