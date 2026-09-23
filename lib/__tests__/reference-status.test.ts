import { describe, expect, it } from "vitest";
import { initialData } from "../node-kinds";
import { referenceStatus } from "../reference-status";

const ref = initialData("reference");

describe("referenceStatus", () => {
  it("counts frames while sampling", () => {
    expect(referenceStatus({ ...ref, status: "running", sampled: 3 })).toBe("Sampling frames 3/8");
    expect(referenceStatus({ ...ref, status: "running" })).toBe("Sampling frames 0/8");
  });

  it("says it is reading the shot once every frame is in", () => {
    expect(referenceStatus({ ...ref, status: "running", sampled: 8 })).toBe("Reading the shot");
  });

  it("shows the summary once done", () => {
    expect(referenceStatus({ ...ref, status: "done", summary: "1 shot, push-in, dusk" })).toBe("1 shot, push-in, dusk");
  });

  it("notes when only the first minute was read", () => {
    expect(referenceStatus({ ...ref, status: "done", summary: "2 shots", duration: 130, trimmed: true })).toBe(
      "2 shots · first 60s of 2:10"
    );
  });

  it("leaves failures to the error banner", () => {
    expect(referenceStatus({ ...ref, status: "error", error: "x" })).toBeNull();
  });
});
