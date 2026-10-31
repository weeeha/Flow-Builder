import { describe, expect, it } from "vitest";
import { ledgerTotals, type LedgerRow } from "../ledger";

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  id: "r",
  nodeId: "n",
  kind: "video",
  provider: "runway",
  status: "done",
  estimate: { kind: "credits", credits: 48 },
  charge: { kind: "pending" },
  ...over,
});

describe("ledgerTotals", () => {
  it("adds reported charges, and counts the estimate of jobs nobody stated", () => {
    const t = ledgerTotals([
      row({ charge: { kind: "charged", credits: 48 } }),
      row({ status: "failed", estimate: { kind: "credits", credits: 120 }, charge: { kind: "not-stated", reason: "" } }),
      row({ status: "failed", charge: { kind: "refunded" } }),
    ]);
    expect(t).toMatchObject({ charged: 48, notStated: 120, refunded: 1, estimate: 216 });
  });

  it("counts an unpriced job that nobody stated, instead of adding 0 credits for it", () => {
    const t = ledgerTotals([
      row({ provider: "fal", estimate: { kind: "unknown" }, charge: { kind: "not-stated", reason: "" } }),
    ]);
    expect(t).toMatchObject({ notStated: 0, notStatedUnpriced: 1, estimate: 0 });
  });

  it("counts running jobs", () => {
    expect(ledgerTotals([row({ status: "running" })]).running).toBe(1);
  });
});
