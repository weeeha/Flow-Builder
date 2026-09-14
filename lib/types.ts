import type { Node, Edge } from "@xyflow/react";

export type HandleType = "text" | "image" | "video" | "audio";

export type NodeStatus = "idle" | "running" | "done" | "error";

export type NodeKind = "image" | "video" | "tts" | "composition";

export interface BaseNodeData extends Record<string, unknown> {
  status: NodeStatus;
  error?: string;
  prompt?: string;
  model?: string;
}

export interface ImageNodeData extends BaseNodeData {
  prompt: string;
  model: "flux-dev" | "flux-schnell" | "nano-banana";
  outputUrl?: string;
}

export interface VideoNodeData extends BaseNodeData {
  prompt: string;
  model: "seedance-2.0" | "kling-1.6" | "veo-3.1";
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

export type FlowNode =
  | Node<ImageNodeData, "image">
  | Node<VideoNodeData, "video">
  | Node<TTSNodeData, "tts">
  | Node<CompositionNodeData, "composition">;

export type FlowEdge = Edge;

export const HANDLE_COLORS: Record<HandleType, string> = {
  text: "#6b7280",
  image: "#3b82f6",
  video: "#8b5cf6",
  audio: "#ec4899",
};
