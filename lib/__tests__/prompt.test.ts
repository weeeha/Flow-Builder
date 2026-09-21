import { describe, expect, it } from "vitest";
import { effectivePrompt } from "../prompt";

describe("effectivePrompt", () => {
  it("returns an empty string when nothing is set", () => {
    expect(effectivePrompt([], undefined)).toBe("");
  });

  it("returns the own prompt when nothing is wired", () => {
    expect(effectivePrompt([], "a cat on a rooftop")).toBe("a cat on a rooftop");
  });

  it("returns the wired text when there is no own prompt", () => {
    expect(effectivePrompt(["neon alley at night"], undefined)).toBe("neon alley at night");
  });

  it("treats an empty own prompt as absent", () => {
    expect(effectivePrompt(["neon alley at night"], "")).toBe("neon alley at night");
  });

  // [HAND] Plan task 12 is Nick's. When a wired text AND the node's own prompt are
  // both present, Nick decides whether the wire prefixes, suffixes or replaces the
  // own prompt, and what joins them. lib/prompt.ts ships a provisional default for
  // this case. Do not assert that default here: write this test after the decision.
  it.todo(
    'effectivePrompt(["neon alley at night"], "in the style of a watercolor") -> Nick decides: prefix, suffix or replace'
  );
});
