"use client";

import { create } from "zustand";
import type { Charge, Provider } from "./charge";
import type { Estimate } from "./pricing";
import type { NodeKind } from "./types";

/** How many tries per node the toolbar total assumes. Multiples, never a guessed retry rate. */
export const TRIES = [1, 3, 5] as const;
export type Tries = (typeof TRIES)[number];

/** One job: what ran, what became of it, and what became of the money. */
export interface LedgerRow {
  id: string;
  nodeId: string;
  kind: NodeKind;
  /** The model id the node ran with, when it has one. */
  model?: string;
  provider: Provider | null;
  status: "running" | "done" | "failed";
  /** The list-price estimate for one try, worked out when the job started. */
  estimate: Estimate;
  charge: Charge;
  error?: string;
}

export interface LedgerTotals {
  /** Credits the providers reported. */
  charged: number;
  refunded: number;
  /** Estimated credits of the jobs whose charge nobody stated. */
  notStated: number;
  /** Jobs whose charge was not stated and that had no price to estimate from. */
  notStatedUnpriced: number;
  /** What the shown jobs were estimated at, one try each. */
  estimate: number;
  running: number;
}

export function ledgerTotals(rows: LedgerRow[]): LedgerTotals {
  const t: LedgerTotals = { charged: 0, refunded: 0, notStated: 0, notStatedUnpriced: 0, estimate: 0, running: 0 };
  for (const row of rows) {
    const credits = row.estimate.kind === "credits" ? row.estimate.credits : null;
    if (credits !== null) t.estimate += credits;
    if (row.status === "running") t.running += 1;
    if (row.charge.kind === "charged") t.charged += row.charge.credits;
    else if (row.charge.kind === "refunded") t.refunded += 1;
    else if (row.charge.kind === "not-stated") {
      if (credits !== null) t.notStated += credits;
      else t.notStatedUnpriced += 1;
    }
  }
  return t;
}

interface LedgerState {
  rows: LedgerRow[];
  open: boolean;
  tries: Tries;
  /** Run all starts a fresh ledger; a single node's Run adds to the one showing. */
  startRun: () => void;
  addRow: (row: LedgerRow) => void;
  finishRow: (id: string, patch: Pick<LedgerRow, "status" | "charge" | "error">) => void;
  setOpen: (open: boolean) => void;
  setTries: (tries: Tries) => void;
}

export const useLedger = create<LedgerState>()((set, get) => ({
  rows: [],
  open: false,
  tries: 1,
  startRun: () => set({ rows: [], open: true }),
  addRow: (row) => set({ rows: [...get().rows, row], open: true }),
  finishRow: (id, patch) =>
    set({ rows: get().rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
  setOpen: (open) => set({ open }),
  setTries: (tries) => set({ tries }),
}));
