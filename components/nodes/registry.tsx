import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";
import { AudioLines, ImageIcon, Layers, Sparkles, Video, type LucideIcon } from "lucide-react";
import type { FlowNode, NodeKind } from "@/lib/types";
import { ClusterNode } from "./cluster-node";
import { CompositionNode } from "./composition-node";
import { ImageNode } from "./image-node";
import { TTSNode } from "./tts-node";
import { VideoNode } from "./video-node";

/**
 * How a kind looks: its icon and its card. The React half of a kind, kept out
 * of NODE_KINDS so routes and tests can read that table without React.
 */
export interface NodeView<K extends NodeKind> {
  icon: LucideIcon;
  Card: ComponentType<NodeProps<Extract<FlowNode, { type: K }>>>;
}

/** Closed with `satisfies`, so the compiler reports a kind without a view. */
export const NODE_VIEWS = {
  image: { icon: ImageIcon, Card: ImageNode },
  video: { icon: Video, Card: VideoNode },
  tts: { icon: AudioLines, Card: TTSNode },
  composition: { icon: Layers, Card: CompositionNode },
  cluster: { icon: Sparkles, Card: ClusterNode },
} satisfies { [K in NodeKind]: NodeView<K> };

/**
 * React Flow's node registry, one entry per kind. Built once at module load:
 * a new object per render makes React Flow warn and remount every node.
 */
export const nodeTypes = Object.fromEntries(
  Object.entries(NODE_VIEWS).map(([kind, view]) => [kind, view.Card])
) as { [K in NodeKind]: (typeof NODE_VIEWS)[K]["Card"] };
