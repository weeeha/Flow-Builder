import { creditsFor, NotWrittenYet, type Price, type Resolution, type Settings } from "./credits-for";
import type { FlowNode, VideoModelId } from "./types";

export { creditsFor, NotWrittenYet };
export type { Price, Resolution, Settings };

/**
 * The date the prices below were read off Runway's pricing page. Prices move
 * with model releases, so the chip's tooltip carries this date, and a charged
 * amount that disagrees with an estimate means the page needs reading again.
 * Source: Runaway/builds/13-runway-coverage/plan.md, Phase 2.
 */
export const PRICES_READ_ON = "2026-10-22";

/** Runway Dev credits are sold at one cent each. */
export const DOLLARS_PER_CREDIT = 0.01;

/**
 * Video models with a recorded list price. The fal models are absent on
 * purpose: nobody has recorded their prices, so their chips say "price
 * unknown" instead of guessing.
 */
export const VIDEO_PRICES: Partial<Record<VideoModelId, Price>> = {
  "runway:gen4.5": { unit: "per-second", credits: 12 },
  "runway:seedance2_5": { unit: "per-second-by-resolution", credits: { "720p": 30 } },
};

/** The Runway route always asks for ratio 1280:720 (app/api/generate/video/route.ts). */
export const RUNWAY_RESOLUTION: Resolution = "720p";

export type Estimate =
  /** A list price was found and worked out. */
  | { kind: "credits"; credits: number }
  /** The node calls a paid provider whose price nobody has recorded. */
  | { kind: "unknown" }
  /** The node runs in the browser; nothing is billed. */
  | { kind: "free" }
  /** creditsFor() is still the [HAND] stub. */
  | { kind: "pending" };

function fromPrice(price: Price, settings: Settings): Estimate {
  try {
    const credits = creditsFor(price, settings);
    return credits === null ? { kind: "unknown" } : { kind: "credits", credits };
  } catch (err) {
    if (err instanceof NotWrittenYet) return { kind: "pending" };
    throw err;
  }
}

/** What one Run of this node would cost at its current settings. */
export function estimateNode(node: FlowNode): Estimate {
  switch (node.type) {
    case "composition":
    case "reference":
      return { kind: "free" };
    case "video": {
      const price = VIDEO_PRICES[node.data.model];
      if (!price) return { kind: "unknown" };
      return fromPrice(price, { seconds: node.data.duration, resolution: RUNWAY_RESOLUTION });
    }
    // Image and speech run on fal and ElevenLabs, cluster on the LLM gateway:
    // all paid, none with a recorded price.
    default:
      return { kind: "unknown" };
  }
}

export interface RunEstimate {
  /** Sum over the nodes that have a price. */
  credits: number;
  /** Nodes that would bill but have no recorded price. */
  unpriced: number;
  /** True while creditsFor() is the [HAND] stub. */
  pending: boolean;
}

/** What Run all would cost if every node ran to completion. */
export function estimateRun(nodes: FlowNode[]): RunEstimate {
  const run: RunEstimate = { credits: 0, unpriced: 0, pending: false };
  for (const node of nodes) {
    const e = estimateNode(node);
    if (e.kind === "credits") run.credits += e.credits;
    else if (e.kind === "unknown") run.unpriced += 1;
    else if (e.kind === "pending") run.pending = true;
  }
  return run;
}

/** "1,240 credits", "1 credit". */
export function formatCredits(credits: number): string {
  return `${credits.toLocaleString("en-US")} ${credits === 1 ? "credit" : "credits"}`;
}

/** "$1.97". */
export function formatDollars(credits: number): string {
  return `$${(credits * DOLLARS_PER_CREDIT).toFixed(2)}`;
}
