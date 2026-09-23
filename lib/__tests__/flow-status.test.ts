import { describe, expect, it } from "vitest";
import { toFlowStatus } from "../flow-status";

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
