import { AudioLines, ImageIcon, Layers, Sparkles, Video, type LucideIcon } from "lucide-react";
import type { NodeKind } from "@/lib/types";

/**
 * A kind's icon: the one thing NODE_KINDS cannot hold, because that table stays
 * free of React so routes and tests can read it. The toolbar and the inspector
 * share this rather than each keeping a copy. Slice 3 folds it into NODE_VIEWS
 * beside each Card. The Record keeps the compiler on a new kind.
 */
export const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  tts: AudioLines,
  composition: Layers,
  cluster: Sparkles,
};
