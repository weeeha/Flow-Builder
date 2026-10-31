import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowNode } from "../types";

// creditsFor() is the [HAND] task, so these tests replace it with a spy and check
// only the plumbing around it: which price and settings reach it, and how its
// answer becomes a chip. They pass whether or not the real one is written.
vi.mock("../credits-for", async (importOriginal) => {
  const real = await importOriginal<typeof import("../credits-for")>();
  return { ...real, creditsFor: vi.fn() };
});

const { creditsFor, NotWrittenYet } = await import("../credits-for");
const { estimateNode, estimateRun, formatCredits, formatDollars, VIDEO_PRICES } = await import(
  "../pricing"
);
const spy = vi.mocked(creditsFor);

const video = (id: string, model: string, duration: number): FlowNode =>
  ({ id, type: "video", position: { x: 0, y: 0 }, data: { status: "idle", prompt: "", model, duration } }) as FlowNode;
const plain = (id: string, type: FlowNode["type"]): FlowNode =>
  ({ id, type, position: { x: 0, y: 0 }, data: { status: "idle" } }) as FlowNode;

// Vitest 5: a bare mockReset() after a mockReturnValue() in an earlier test left
// a later throwing mockImplementation escaping the caller's catch. Setting an
// explicit default after the reset keeps each test's implementation its own.
beforeEach(() => {
  spy.mockReset();
  spy.mockImplementation(() => null);
});

describe("estimateNode", () => {
  it("hands a Runway video node's price, length and 720p to creditsFor", () => {
    spy.mockReturnValue(72);
    expect(estimateNode(video("v", "runway:gen4.5", 6))).toEqual({ kind: "credits", credits: 72 });
    expect(spy).toHaveBeenCalledWith(VIDEO_PRICES["runway:gen4.5"], { seconds: 6, resolution: "720p" });
  });

  it("reads null from creditsFor as unknown, never as free", () => {
    spy.mockReturnValue(null);
    expect(estimateNode(video("v", "runway:seedance2_5", 4))).toEqual({ kind: "unknown" });
  });

  it("reads the [HAND] stub as pending", () => {
    spy.mockImplementation(() => {
      throw new NotWrittenYet("creditsFor");
    });
    expect(estimateNode(video("v", "runway:gen4.5", 6))).toEqual({ kind: "pending" });
  });

  it("lets any other error through", () => {
    spy.mockImplementation(() => {
      throw new TypeError("bad table");
    });
    expect(() => estimateNode(video("v", "runway:gen4.5", 6))).toThrow("bad table");
  });

  it("says unknown for a fal video model, with no call to creditsFor", () => {
    expect(estimateNode(video("v", "kling-1.6", 6))).toEqual({ kind: "unknown" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("says unknown for the paid nodes nobody priced, and free for browser-only ones", () => {
    expect(estimateNode(plain("i", "image"))).toEqual({ kind: "unknown" });
    expect(estimateNode(plain("t", "tts"))).toEqual({ kind: "unknown" });
    expect(estimateNode(plain("c", "cluster"))).toEqual({ kind: "unknown" });
    expect(estimateNode(plain("m", "composition"))).toEqual({ kind: "free" });
    expect(estimateNode(plain("r", "reference"))).toEqual({ kind: "free" });
  });
});

describe("estimateRun", () => {
  it("adds the priced nodes and counts the unpriced ones", () => {
    spy.mockReturnValueOnce(72).mockReturnValueOnce(120);
    const nodes = [
      video("a", "runway:gen4.5", 6),
      video("b", "runway:seedance2_5", 4),
      plain("i", "image"),
      plain("m", "composition"),
    ];
    expect(estimateRun(nodes)).toEqual({ credits: 192, unpriced: 1, pending: false });
  });

  it("flags pending when any node hits the stub", () => {
    spy.mockImplementation(() => {
      throw new NotWrittenYet("creditsFor");
    });
    expect(estimateRun([video("a", "runway:gen4.5", 6)])).toEqual({ credits: 0, unpriced: 0, pending: true });
  });

  it("is zero for an empty canvas", () => {
    expect(estimateRun([])).toEqual({ credits: 0, unpriced: 0, pending: false });
  });
});

describe("formatting", () => {
  it("groups thousands and keeps the singular", () => {
    expect(formatCredits(1240)).toBe("1,240 credits");
    expect(formatCredits(1)).toBe("1 credit");
  });

  it("prices a credit at one cent", () => {
    expect(formatDollars(197)).toBe("$1.97");
    expect(formatDollars(0)).toBe("$0.00");
  });
});

describe("tries and the read date", () => {
  it("multiplies the priced nodes by the tries, and leaves the unpriced count alone", () => {
    spy.mockReturnValue(48);
    const nodes = [video("a", "runway:gen4.5", 4), video("b", "kling-1.6", 4)];
    expect(estimateRun(nodes, 3)).toEqual({ credits: 144, unpriced: 1, pending: false });
  });

  it("calls the table stale only after 30 days", async () => {
    const { pricesStale } = await import("../pricing");
    expect(pricesStale(new Date("2026-11-29T00:00:00Z"), "2026-10-30")).toBe(false);
    expect(pricesStale(new Date("2026-12-01T00:00:00Z"), "2026-10-30")).toBe(true);
  });

  it("writes the read date the way the toolbar says it", async () => {
    const { formatReadOn } = await import("../pricing");
    expect(formatReadOn("2026-10-30")).toBe("30 Oct 2026");
  });
});
