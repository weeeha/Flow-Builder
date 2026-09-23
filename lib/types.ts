import type { Node, Edge } from "@xyflow/react";

export type HandleType = "text" | "image" | "video" | "audio";

export type NodeStatus = "idle" | "running" | "done" | "error";

export type NodeKind = "image" | "video" | "tts" | "composition" | "cluster" | "reference";

/** What is wired into a node, bucketed by the type of the source handle. */
export interface NodeInputs {
  texts: string[];
  images: string[];
  videos: string[];
  audios: string[];
}

/** Which backend a video model is served from. */
export type VideoProvider = "fal" | "runway";

/**
 * Video model ids. Runway-routed models carry a `runway:` prefix so the API
 * route can dispatch on the id alone and old persisted graphs (fal ids with
 * no prefix) keep working unchanged.
 */
export type VideoModelId =
  | "seedance-2.0"
  | "kling-1.6"
  | "veo-3.1"
  | "runway:gen4.5"
  | "runway:seedance2_5";

export interface BaseNodeData extends Record<string, unknown> {
  status: NodeStatus;
  error?: string;
  prompt?: string;
  model?: string;
  /** Text this node offers on its plain text source handle. */
  outputText?: string;
  /** Text per named text source handle, keyed by the handle id's port segment. */
  outputTexts?: Record<string, string>;
}

export interface ImageNodeData extends BaseNodeData {
  prompt: string;
  model: "flux-dev" | "flux-schnell" | "nano-banana";
  outputUrl?: string;
}

export interface VideoNodeData extends BaseNodeData {
  prompt: string;
  model: VideoModelId;
  duration: 4 | 6 | 8;
  outputUrl?: string;
}

export interface TTSNodeData extends BaseNodeData {
  prompt: string;
  voice: string;
  model: "eleven_multilingual_v2" | "eleven_turbo_v2_5";
  outputUrl?: string;
}

export interface CompositionNodeData extends BaseNodeData {
  videoUrl?: string;
  audioUrl?: string;
}

export interface ClusterGroup {
  id: string;
  /** The one thing this group varies, e.g. "camera" or "era". */
  axis: string;
  /** The deliberately surprising group. */
  wild?: boolean;
  suggestions: { id: string; text: string }[];
}

/** A pin copies the suggestion's text, so its wire survives a re-roll. */
export interface PinnedSuggestion {
  id: string;
  text: string;
  axis: string;
}

export interface ClusterNodeData extends BaseNodeData {
  prompt: string;
  groups: ClusterGroup[];
  pinned: PinnedSuggestion[];
  /** One entry per pin, keyed by the pin id, which is also its handle's port. */
  outputTexts: Record<string, string>;
  stub?: boolean;
}

/**
 * A dropped clip and what was read from it. Built by the drop pipeline, never
 * from the toolbar.
 */
export interface ReferenceNodeData extends BaseNodeData {
  /** An object URL for this session, or a Blob URL once uploads exist. */
  clipUrl?: string;
  /** True after a reload lost a session-only clip. */
  clipMissing?: boolean;
  frames: { t: number; dataUrl: string }[];
  duration: number;
  hasAudio: boolean | "unknown";
  /** "1 shot, push-in, dusk", written by the model. */
  summary?: string;
  path?: "first pass" | "repaired" | "fallback";
  /** What the video output hands on; the clip itself. */
  outputUrl?: string;
}

export type FlowNode =
  | Node<ImageNodeData, "image">
  | Node<VideoNodeData, "video">
  | Node<TTSNodeData, "tts">
  | Node<CompositionNodeData, "composition">
  | Node<ClusterNodeData, "cluster">
  | Node<ReferenceNodeData, "reference">;

export type FlowEdge = Edge;

export const HANDLE_COLORS: Record<HandleType, string> = {
  text: "#6b7280",
  image: "#3b82f6",
  video: "#8b5cf6",
  audio: "#ec4899",
};
