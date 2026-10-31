import { describe, expect, it } from "vitest";
import { chargeFor, chargeLabel, providerFor } from "../charge";
import { initialData } from "../node-kinds";
import type { FlowNode, NodeKind } from "../types";

const node = (type: NodeKind, data: Record<string, unknown> = {}): FlowNode =>
  ({ id: "n", type, position: { x: 0, y: 0 }, data: { ...initialData(type), ...data } }) as FlowNode;

describe("providerFor", () => {
  it("bills Runway and fal video models to their provider", () => {
    expect(providerFor(node("video", { model: "runway:gen4.5" }))).toBe("runway");
    expect(providerFor(node("video", { model: "kling-1.6" }))).toBe("fal");
  });

  it("names a provider for every paid kind and none for the browser-only ones", () => {
    expect(providerFor(node("image"))).toBe("fal");
    expect(providerFor(node("tts"))).toBe("elevenlabs");
    expect(providerFor(node("cluster"))).toBe("gateway");
    expect(providerFor(node("composition"))).toBeNull();
    expect(providerFor(node("reference"))).toBeNull();
  });
});

describe("chargeFor", () => {
  it("takes the credits Runway reported for a finished task", () => {
    expect(chargeFor("done", "runway", { stub: false, cost: 48 })).toEqual({ kind: "charged", credits: 48 });
  });

  it("reads a reported 0 on a failed task as a refund", () => {
    expect(chargeFor("failed", "runway", { stub: false, cost: 0 })).toEqual({ kind: "refunded" });
  });

  it("keeps a failed task that was billed as charged, not as failed money", () => {
    expect(chargeFor("failed", "runway", { stub: false, cost: 48 })).toEqual({ kind: "charged", credits: 48 });
  });

  it("says nothing was charged in stub mode, whatever the outcome", () => {
    expect(chargeFor("done", "runway", { stub: true }).kind).toBe("none");
    expect(chargeFor("failed", "runway", { stub: true }).kind).toBe("none");
  });

  it("says nothing was charged when the route refused before calling a provider", () => {
    expect(chargeFor("failed", "fal", { stub: false, refused: true }).kind).toBe("none");
  });

  it("says nothing was charged for a node that runs in the browser", () => {
    expect(chargeFor("done", null).kind).toBe("none");
  });

  it("never guesses a refund: a Runway task we stopped waiting for is not stated", () => {
    const charge = chargeFor("failed", "runway", { stub: false, costMissing: "timed-out" });
    expect(charge.kind).toBe("not-stated");
    expect(charge.kind === "not-stated" && charge.reason).toMatch(/may still finish/);
  });

  it("says why for a provider that reports no cost per job", () => {
    const charge = chargeFor("failed", "fal", { stub: false });
    expect(charge.kind === "not-stated" && charge.reason).toMatch(/server errors are not billed/);
  });

  it("is not stated when the route sent no receipt at all", () => {
    expect(chargeFor("failed", "runway").kind).toBe("not-stated");
  });
});

describe("chargeLabel", () => {
  it("gives every state a word", () => {
    for (const charge of [
      { kind: "pending" },
      { kind: "charged", credits: 1 },
      { kind: "refunded" },
      { kind: "not-stated", reason: "" },
      { kind: "none", reason: "" },
    ] as const) {
      expect(chargeLabel(charge)).toMatch(/\w/);
    }
  });
});
