import { describe, expect, it } from "vitest";
import { runCostLines } from "../balance";

const run = (credits: number, unpriced = 0, pending = false) => ({ credits, unpriced, pending });

describe("runCostLines, the estimate line", () => {
  it("shows credits and dollars", () => {
    expect(runCostLines(run(192), { mode: "stub" }).estimate).toBe("about 192 credits ($1.92)");
  });

  it("names the unpriced nodes beside a priced sum", () => {
    expect(runCostLines(run(72, 2), { mode: "stub" }).estimate).toBe("about 72 credits ($0.72), 2 unpriced");
  });

  it("counts unpriced nodes when nothing has a price", () => {
    expect(runCostLines(run(0, 1), { mode: "stub" }).estimate).toBe("1 node unpriced");
    expect(runCostLines(run(0, 3), { mode: "stub" }).estimate).toBe("3 nodes unpriced");
  });

  it("says nothing is billed for an empty or browser-only canvas", () => {
    expect(runCostLines(run(0), { mode: "stub" }).estimate).toBe("nothing billed");
  });

  it("says pending while creditsFor is the [HAND] stub, whatever else it knows", () => {
    expect(runCostLines(run(0, 2, true), { mode: "stub" }).estimate).toBe("price pending");
  });
});

describe("runCostLines, the balance line", () => {
  it("covers loading, stub and error", () => {
    expect(runCostLines(run(72), { mode: "loading" }).balance).toBe("checking balance");
    expect(runCostLines(run(72), { mode: "stub" }).balance).toBe("Runway stub mode, nothing charged");
    expect(runCostLines(run(72), { mode: "error", error: "401" }).balance).toBe("balance unavailable");
  });

  it("shows a live balance that covers the run", () => {
    expect(runCostLines(run(192), { mode: "live", credits: 1240 })).toEqual({
      estimate: "about 192 credits ($1.92)",
      balance: "balance 1,240 credits",
      short: false,
    });
  });

  it("flags a live balance below the run", () => {
    const lines = runCostLines(run(192), { mode: "live", credits: 50 });
    expect(lines.short).toBe(true);
    expect(lines.balance).toBe("balance 50 credits, short of this run");
  });

  it("does not call a balance short against a pending estimate", () => {
    // 100 credits priced so far, but the rest is unknown: 50 is not provably short.
    expect(runCostLines(run(100, 0, true), { mode: "live", credits: 50 }).short).toBe(false);
  });
});
