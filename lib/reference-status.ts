import { FRAME_COUNT } from "./frames";
import type { ReferenceNodeData } from "./types";

/**
 * The one line a reference card shows about where its clip stands. Failures
 * return null: BaseNode's red banner carries those.
 */
export function referenceStatus(data: ReferenceNodeData): string | null {
  if (data.status === "running") {
    const sampled = data.sampled ?? 0;
    return sampled < FRAME_COUNT ? `Sampling frames ${sampled}/${FRAME_COUNT}` : "Reading the shot";
  }
  if (data.status === "error") return null;
  return data.summary ?? null;
}
