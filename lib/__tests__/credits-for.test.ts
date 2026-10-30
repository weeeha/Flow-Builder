import { describe, expect, it } from "vitest";
import { creditsFor, type Price } from "../credits-for";

// [HAND] These fail until creditsFor() is written by hand. They say what done means.
// The prices here are fixtures, not the real table: the function must not know
// which model it is pricing.

const perImage: Price = { unit: "per-image", credits: 5 };
const perSecond: Price = { unit: "per-second", credits: 12 };
const byResolution: Price = { unit: "per-second-by-resolution", credits: { "480p": 10, "720p": 30 } };

describe("[HAND] creditsFor, per image", () => {
  it("charges one image when the node does not say how many", () => {
    expect(creditsFor(perImage, {})).toBe(5);
  });

  it("charges every image a run makes", () => {
    expect(creditsFor(perImage, { images: 3 })).toBe(15);
  });
});

describe("[HAND] creditsFor, per second", () => {
  it("multiplies the rate by the clip length", () => {
    expect(creditsFor(perSecond, { seconds: 6 })).toBe(72);
    expect(creditsFor(perSecond, { seconds: 8 })).toBe(96);
  });

  it("returns null, not 0, when the node has no length", () => {
    expect(creditsFor(perSecond, {})).toBeNull();
  });
});

describe("[HAND] creditsFor, per second at a resolution", () => {
  it("uses the rate for the node's resolution", () => {
    expect(creditsFor(byResolution, { seconds: 4, resolution: "720p" })).toBe(120);
    expect(creditsFor(byResolution, { seconds: 4, resolution: "480p" })).toBe(40);
  });

  it("returns null for a resolution the table does not list", () => {
    expect(creditsFor(byResolution, { seconds: 4, resolution: "1080p" })).toBeNull();
  });

  it("returns null when either the length or the resolution is missing", () => {
    expect(creditsFor(byResolution, { seconds: 4 })).toBeNull();
    expect(creditsFor(byResolution, { resolution: "720p" })).toBeNull();
  });
});
