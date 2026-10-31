"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCredits, formatDollars, type RunEstimate } from "./pricing";

/** What /api/balance answers. Only Runway reports a balance; fal and ElevenLabs do not. */
export type Balance =
  | { mode: "stub" }
  | { mode: "live"; credits: number }
  | { mode: "error"; error: string };

export type BalanceState = Balance | { mode: "loading" };

export async function fetchBalance(): Promise<Balance> {
  try {
    const res = await fetch("/api/balance", { cache: "no-store" });
    return (await res.json()) as Balance;
  } catch (err) {
    return { mode: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** The Runway balance, read once on mount and again whenever `refresh` is called. */
export function useBalance(): [BalanceState, () => Promise<void>] {
  const [balance, setBalance] = useState<BalanceState>({ mode: "loading" });
  const refresh = useCallback(async () => setBalance(await fetchBalance()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return [balance, refresh];
}

export interface RunCostLines {
  /** What Run all would cost. */
  estimate: string;
  /** The balance, or why there is none. */
  balance: string;
  /** True when a live balance is below the estimate. */
  short: boolean;
}

/** The two lines beside the Run all button. */
export function runCostLines(run: RunEstimate, balance: BalanceState): RunCostLines {
  let estimate: string;
  if (run.pending) estimate = "price pending";
  else if (run.credits > 0) {
    estimate = `about ${formatCredits(run.credits)} (${formatDollars(run.credits)})`;
    if (run.unpriced > 0) estimate += `, ${run.unpriced} unpriced`;
  } else if (run.unpriced > 0) {
    estimate = `${run.unpriced} ${run.unpriced === 1 ? "node" : "nodes"} unpriced`;
  } else estimate = "nothing billed";

  switch (balance.mode) {
    case "loading":
      return { estimate, balance: "checking balance", short: false };
    case "stub":
      return { estimate, balance: "Runway stub mode, nothing charged", short: false };
    case "error":
      return { estimate, balance: "balance unavailable", short: false };
    case "live": {
      const short = !run.pending && balance.credits < run.credits;
      return {
        estimate,
        balance: short
          ? `balance ${formatCredits(balance.credits)}, short of this run`
          : `balance ${formatCredits(balance.credits)}`,
        short,
      };
    }
  }
}
