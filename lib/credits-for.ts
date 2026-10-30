/**
 * The arithmetic behind every cost chip: one list price, one node's settings,
 * one number of credits. Kept apart from lib/pricing.ts so the price table and
 * the node plumbing can change without touching it.
 */

export type Resolution = "480p" | "720p" | "1080p";

/** How a provider bills one run. Runway Dev credits, one credit is one US cent. */
export type Price =
  | { unit: "per-image"; credits: number }
  | { unit: "per-second"; credits: number }
  /** Only the resolutions someone actually read off the pricing page are listed. */
  | { unit: "per-second-by-resolution"; credits: Partial<Record<Resolution, number>> };

/** What a node is about to ask for. Every field is optional because nodes differ. */
export interface Settings {
  /** Clip length in seconds. */
  seconds?: number;
  /** How many images one run makes. */
  images?: number;
  resolution?: Resolution;
}

/** Thrown by a [HAND] stub until it is written. The chip reads it as "price pending". */
export class NotWrittenYet extends Error {
  constructor(what: string) {
    super(`${what} is a [HAND] task and has not been written yet`);
    this.name = "NotWrittenYet";
  }
}

/**
 * [HAND] Write this yourself, no agent. Done means every test in
 * lib/__tests__/credits-for.test.ts passes: `pnpm test credits-for`.
 *
 * Credits for one run of a node with these settings, under this price.
 * Return null when the price cannot be worked out from what the node gave you
 * (a per-second price with no seconds, a resolution the table does not list).
 * Never return 0 to mean "unknown": 0 would show the user a free run.
 */
export function creditsFor(price: Price, settings: Settings): number | null {
  void price;
  void settings;
  throw new NotWrittenYet("creditsFor");
}
