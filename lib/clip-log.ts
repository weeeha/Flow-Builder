import type { ClipPath } from "./clip-schema";

/**
 * A local record of which path produced each clip's graph, so the model's
 * first-pass validity rate is measurable over time. Stub runs always validate,
 * so they are counted apart and never enter the rate.
 */

export const CLIP_LOG_KEY = "flow-builder-clip-log";

interface ClipRun {
  path: ClipPath;
  stub: boolean;
  at: string;
}

function read(): ClipRun[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIP_LOG_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordClipRun(run: { path: ClipPath; stub: boolean }): void {
  try {
    localStorage.setItem(CLIP_LOG_KEY, JSON.stringify([...read(), { ...run, at: new Date().toISOString() }]));
  } catch {
    // A full or blocked store loses a log entry, never the drop.
  }
}

export function clipLogCounts(): {
  real: Record<ClipPath, number>;
  stub: number;
  firstPassRate: number | null;
} {
  const real: Record<ClipPath, number> = { "first pass": 0, repaired: 0, fallback: 0 };
  let stub = 0;
  for (const run of read()) {
    if (run.stub) stub++;
    else if (run.path in real) real[run.path]++;
  }
  const total = real["first pass"] + real.repaired + real.fallback;
  return { real, stub, firstPassRate: total ? real["first pass"] / total : null };
}
