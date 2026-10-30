"use client";

import { useMemo } from "react";
import { runCostLines, type BalanceState } from "@/lib/balance";
import { estimateRun, PRICES_READ_ON } from "@/lib/pricing";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * What Run all would cost, and the balance it would come out of, beside the
 * Run all button. The estimate assumes every node runs to the end; Run all
 * stops at the first failure, so the real charge can only be lower.
 */
export function RunCost({ balance }: { balance: BalanceState }) {
  const nodes = useFlowStore((s) => s.nodes);
  const run = useMemo(() => estimateRun(nodes), [nodes]);
  const lines = runCostLines(run, balance);

  return (
    <div
      data-slot="run-cost"
      title={`Runway list prices read ${PRICES_READ_ON}. Run all stops at the first failure, so the charge can be lower.`}
      className="flex min-w-[11.5rem] flex-col justify-center px-2 text-right text-[12px] leading-4 tabular-nums"
    >
      <span className="whitespace-nowrap text-neutral-800">{lines.estimate}</span>
      <span className={cn("whitespace-nowrap", lines.short ? "text-red-700" : "text-neutral-500")}>
        {lines.balance}
      </span>
    </div>
  );
}
