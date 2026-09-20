import type { VideoModelId, VideoProvider } from "./types";

export interface VideoModel {
  id: VideoModelId;
  label: string;
  provider: VideoProvider;
  /** Short hint shown next to the option, e.g. what the model is good at. */
  note?: string;
}

/**
 * Single registry for the video node's model picker and the API route.
 * Add a model here and both the UI and the dispatcher pick it up.
 */
export const VIDEO_MODELS: VideoModel[] = [
  { id: "seedance-2.0", label: "Seedance 2.0 Lite", provider: "fal" },
  { id: "kling-1.6", label: "Kling 1.6", provider: "fal" },
  { id: "veo-3.1", label: "Veo 3.1 Fast", provider: "fal" },
  {
    id: "runway:gen4.5",
    label: "Gen-4.5",
    provider: "runway",
    note: "Runway's own model, strongest on character consistency",
  },
  {
    id: "runway:seedance2_5",
    label: "Seedance 2.5",
    provider: "runway",
    note: "ByteDance model served through Runway's router",
  },
];

export const PROVIDER_LABELS: Record<VideoProvider, string> = {
  fal: "fal.ai",
  runway: "Runway",
};

export const PROVIDERS: VideoProvider[] = ["fal", "runway"];

export function providerOf(id: VideoModelId): VideoProvider {
  return id.startsWith("runway:") ? "runway" : "fal";
}

/** Strip the routing prefix to get the id Runway's API expects. */
export function runwayModelId(id: VideoModelId): string {
  return id.replace(/^runway:/, "");
}

export function videoModelLabel(id: VideoModelId): string {
  const m = VIDEO_MODELS.find((x) => x.id === id);
  return m ? `${PROVIDER_LABELS[m.provider]} · ${m.label}` : id;
}

/**
 * Default AI Gateway slug for LLM routes. It lives here, not in lib/llm.ts, because
 * that file is server-only and node headers need the label on the client.
 */
export const DEFAULT_LLM_MODEL = "anthropic/claude-sonnet-5";

/** Strip the provider prefix for display: "anthropic/claude-sonnet-5" reads "claude-sonnet-5". */
export function llmModelLabel(slug: string): string {
  return slug.replace(/^[^/]+\//, "");
}
