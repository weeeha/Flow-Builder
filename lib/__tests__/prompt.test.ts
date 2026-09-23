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

  // Plan task 12, Nick's rule (2A): own prompt first, then the wire, one space between.
  it("puts the own prompt first and the wired text after it when both are present", () => {
    expect(effectivePrompt(["neon alley at night"], "in the style of a watercolor")).toBe(
      "in the style of a watercolor neon alley at night"
    );
  });
});
