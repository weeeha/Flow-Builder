import { describe, expect, it } from "vitest";
import { slotStatus, toFlowStatus } from "../flow-status";

describe("toFlowStatus", () => {
  it("maps idle to idle", () => {
    expect(toFlowStatus("idle")).toBe("idle");
  });

  it("maps running to streaming", () => {
    expect(toFlowStatus("running")).toBe("streaming");
  });

  it("maps done to done", () => {
    expect(toFlowStatus("done")).toBe("done");
  });

  it("maps error to failed", () => {
    expect(toFlowStatus("error")).toBe("failed");
  });

  // runAll in lib/executor.ts runs nodes one at a time, so today "running" always
  // means this node is generating now — there is no waiting/queued state yet.
  it.todo(
    "queued: not for now (Nick, 2026-09-23); revisit if Run all ever runs nodes in parallel"
  );
});

describe("slotStatus", () => {
  it("shows an idle node's earlier output, as after a reload", () => {
    expect(slotStatus("idle", "https://example.com/a.png")).toBe("done");
  });

  it("leaves an idle node with nothing to show idle", () => {
    expect(slotStatus("idle", undefined)).toBe("idle");
  });

  it("follows the node's status otherwise, output or not", () => {
    expect(slotStatus("running", "https://example.com/a.png")).toBe("streaming");
    expect(slotStatus("error", "https://example.com/a.png")).toBe("failed");
    expect(slotStatus("done", undefined)).toBe("done");
  });
});
