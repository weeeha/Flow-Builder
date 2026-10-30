"use client";

import { useMemo } from "react";
import { runCostLines, type BalanceState } from "@/lib/balance";
import { TRIES, useLedger } from "@/lib/ledger";
import { estimateRun, formatReadOn, pricesStale } from "@/lib/pricing";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * What Run all would cost, and the balance it would come out of, beside the
 * Run all button. The estimate assumes every node runs to the end, `tries`
 * times; Run all stops at the first failure, so one pass can only cost less.
 */
export function RunCost({ balance }: { balance: BalanceState }) {
  const nodes = useFlowStore((s) => s.nodes);
  const tries = useLedger((s) => s.tries);
  const run = useMemo(() => estimateRun(nodes, tries), [nodes, tries]);
  const lines = runCostLines(run, balance);
  const stale = pricesStale(new Date());

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <TriesControl />
      <div
        data-slot="run-cost"
        title={`Runway list prices read ${formatReadOn()}. Run all stops at the first failure, so the charge can be lower.`}
        className="flex min-w-[11.5rem] flex-col justify-center px-2 text-right text-[12px] leading-4 tabular-nums"
      >
        <span aria-live="polite" className="whitespace-nowrap text-neutral-800">
          {lines.estimate}
          {tries > 1 && run.credits > 0 && ` at ${tries} tries`}
        </span>
        <span className={cn("whitespace-nowrap", lines.short ? "text-red-700" : "text-neutral-500")}>
          {lines.balance}
        </span>
        {stale && (
          <span className="whitespace-nowrap text-amber-800">
            prices read {formatReadOn()}, may have changed
          </span>
        )}
      </div>
    </div>
  );
}

/** 1, 3 or 5 tries per node: what the total looks like if takes need redoing. */
function TriesControl() {
  const tries = useLedger((s) => s.tries);
  const setTries = useLedger((s) => s.setTries);
  return (
    <div role="group" aria-label="Tries per node" className="flex items-center gap-1.5">
      <span aria-hidden className="whitespace-nowrap text-[12px] text-neutral-500">
        Tries per node
      </span>
      <div className="flex rounded-lg border border-neutral-200 p-0.5">
        {TRIES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={tries === n}
            onClick={() => setTries(n)}
            className={cn(
              "h-6 min-w-6 rounded-md px-1.5 text-[12px] tabular-nums transition-colors",
              tries === n ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
