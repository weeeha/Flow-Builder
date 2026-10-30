"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCredits, formatDollars, PRICES_READ_ON, type Estimate } from "@/lib/pricing";

function copyFor(estimate: Estimate): { label: string; title: string } {
  switch (estimate.kind) {
    case "credits":
      return {
        label: `about ${formatCredits(estimate.credits)}`,
        title: `Runway list price read ${PRICES_READ_ON}: ${formatDollars(estimate.credits)} per run`,
      };
    case "unknown":
      return {
        label: "price unknown",
        title: "This provider bills per run, but no price is recorded for it in lib/pricing.ts",
      };
    case "free":
      return { label: "no charge", title: "Runs in your browser; no provider is called" };
    case "pending":
      return {
        label: "price pending",
        title: "creditsFor() in lib/credits-for.ts is a [HAND] task and is not written yet",
      };
  }
}

/** What one Run of a node would cost, shown before anyone presses Run. */
export function CostChip({ estimate, className }: { estimate: Estimate; className?: string }) {
  const { label, title } = copyFor(estimate);
  return (
    <span
      data-slot="cost-chip"
      data-kind={estimate.kind}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-1.5 py-px text-[12px] leading-4 tabular-nums",
        estimate.kind === "credits" ? "text-neutral-800" : "text-neutral-600",
        className
      )}
    >
      <Coins size={11} aria-hidden className="shrink-0" />
      {label}
    </span>
  );
}
