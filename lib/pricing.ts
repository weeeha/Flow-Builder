import { creditsFor, NotWrittenYet, type Price, type Resolution, type Settings } from "./credits-for";
import type { FlowNode, VideoModelId } from "./types";

export { creditsFor, NotWrittenYet };
export type { Price, Resolution, Settings };

/**
 * The date the prices below were read off Runway's pricing page. Prices move
 * with model releases, so the chip's tooltip carries this date, and a charged
 * amount that disagrees with an estimate means the page needs reading again.
 * First read 2026-10-22 (Runaway/builds/13-runway-coverage/plan.md, Phase 2);
 * read again 2026-10-30 from docs.dev.runwayml.com/guides/pricing, same rates.
 */
export const PRICES_READ_ON = "2026-10-30";

/** After this many days the toolbar says the prices may have changed. */
export const PRICES_STALE_AFTER_DAYS = 30;

/** True once the price table is older than PRICES_STALE_AFTER_DAYS. */
export function pricesStale(now: Date, readOn: string = PRICES_READ_ON): boolean {
  const age = now.getTime() - new Date(`${readOn}T00:00:00Z`).getTime();
  return age > PRICES_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/** "30 Oct 2026". */
export function formatReadOn(readOn: string = PRICES_READ_ON): string {
  return new Date(`${readOn}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Runway Dev credits are sold at one cent each. */
export const DOLLARS_PER_CREDIT = 0.01;

/**
 * Video models with a recorded list price. The fal models are absent on
 * purpose: nobody has recorded their prices, so their chips say "price
 * unknown" instead of guessing.
 */
export const VIDEO_PRICES: Partial<Record<VideoModelId, Price>> = {
  "runway:gen4.5": { unit: "per-second", credits: 12 },
  "runway:seedance2_5": { unit: "per-second-by-resolution", credits: { "480p": 20, "720p": 30, "1080p": 68 } },
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

/**
 * What Run all would cost if every node ran to completion, `tries` times each.
 * Tries are a plain multiple: nobody has data on real retry rates.
 */
export function estimateRun(nodes: FlowNode[], tries = 1): RunEstimate {
  const run: RunEstimate = { credits: 0, unpriced: 0, pending: false };
  for (const node of nodes) {
    const e = estimateNode(node);
    if (e.kind === "credits") run.credits += e.credits * tries;
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
