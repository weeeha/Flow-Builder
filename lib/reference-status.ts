import { FRAME_COUNT, MAX_CLIP_SECONDS } from "./frames";
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
  if (!data.summary) return null;
  return data.trimmed ? `${data.summary} · first ${MAX_CLIP_SECONDS}s of ${clock(data.duration)}` : data.summary;
}

/** 130 → "2:10". */
function clock(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
