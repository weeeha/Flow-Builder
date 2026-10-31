"use client";

import { X } from "lucide-react";
import { STATUS_LABEL } from "@/components/flow/node-status";
import { chargeLabel, type Charge, type Provider } from "@/lib/charge";
import { ledgerTotals, useLedger, type LedgerRow } from "@/lib/ledger";
import { VIDEO_MODELS } from "@/lib/models";
import { NODE_KINDS, type FieldSpec } from "@/lib/node-kinds";
import { formatCredits, formatReadOn } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const PROVIDER_NAMES: Record<Provider, string> = {
  runway: "Runway",
  fal: "fal.ai",
  elevenlabs: "ElevenLabs",
  gateway: "AI Gateway",
};

/** Runway's own page for the failure codes a task can end with. */
const RUNWAY_FAILURES_URL = "https://docs.dev.runwayml.com/errors/task-failures/";

/** The ledger shows job status in the canvas's own words; "running" is FlowStatus "streaming". */
const STATUS_WORD: Record<LedgerRow["status"], string> = {
  running: STATUS_LABEL.streaming,
  done: STATUS_LABEL.done,
  failed: STATUS_LABEL.failed,
};

const STATUS_COLOR: Record<LedgerRow["status"], string> = {
  running: "bg-[var(--flow-streaming)]",
  done: "bg-[var(--flow-done)]",
  failed: "bg-[var(--flow-failed)]",
};

/** The model's own label from the kind's select, as the inspector shows it. */
function modelName(row: LedgerRow): string {
  const video = VIDEO_MODELS.find((m) => m.id === row.model);
  if (video) return video.label;
  const field = (NODE_KINDS[row.kind].fields as Record<string, FieldSpec | undefined>).model;
  const option = field?.control === "select" ? field.options.find((o) => o.value === row.model) : undefined;
  return option?.label ?? row.model ?? NODE_KINDS[row.kind].label;
}

/** The credits cell: what the provider reported, or the estimate, marked as one. */
function creditsText(row: LedgerRow): { text: string; reported: boolean } {
  if (row.charge.kind === "charged") return { text: formatCredits(row.charge.credits), reported: true };
  if (row.charge.kind === "refunded") return { text: "0 credits", reported: true };
  if (row.estimate.kind === "credits") return { text: `about ${formatCredits(row.estimate.credits)}`, reported: false };
  if (row.estimate.kind === "pending") return { text: "price pending", reported: false };
  return { text: "unpriced", reported: false };
}

function reasonOf(charge: Charge): string | null {
  return charge.kind === "not-stated" || charge.kind === "none" ? charge.reason : null;
}

/**
 * One row per job from the last Run all, plus any single Runs since. Status and
 * charge are two separate facts on every row: a failed job can still be charged.
 */
export function RunLedger() {
  const rows = useLedger((s) => s.rows);
  const open = useLedger((s) => s.open);
  const setOpen = useLedger((s) => s.setOpen);
  if (!open) return null;

  const totals = ledgerTotals(rows);
  const allStub = rows.length > 0 && rows.every((r) => r.charge.kind === "none");

  return (
    <section
      aria-labelledby="run-ledger-title"
      className="absolute left-4 right-4 top-16 z-10 flex max-h-[50dvh] flex-col rounded-xl border border-neutral-200 bg-white shadow-lg sm:right-auto sm:w-[24rem]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 pl-3 pr-1.5">
        <h2 id="run-ledger-title" className="text-[13px] font-semibold">
          Run ledger
        </h2>
        <button
          type="button"
          aria-label="Close the run ledger"
          onClick={() => setOpen(false)}
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-neutral-600">Run the graph to see what each job cost.</p>
      ) : (
        <>
          <Totals totals={totals} allStub={allStub} />
          <ol className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
            {rows.map((row) => (
              <JobRow key={row.id} row={row} allStub={allStub} />
            ))}
          </ol>
        </>
      )}

      <p className="border-t border-neutral-100 px-3 py-2 text-[12px] text-neutral-500">
        Estimates are Runway list prices read {formatReadOn()}, one try each.
      </p>
    </section>
  );
}

function Totals({ totals, allStub }: { totals: ReturnType<typeof ledgerTotals>; allStub: boolean }) {
  const lines: string[] = [];
  if (totals.notStated > 0) lines.push(`${formatCredits(totals.notStated)} not stated`);
  if (totals.notStatedUnpriced > 0) {
    lines.push(`${totals.notStatedUnpriced} unpriced ${totals.notStatedUnpriced === 1 ? "job" : "jobs"} not stated`);
  }
  if (totals.refunded > 0) lines.push(`${totals.refunded} refunded`);
  if (totals.estimate > 0) lines.push(`Estimate was ${formatCredits(totals.estimate)}`);
  if (totals.running > 0) lines.push(`${totals.running} still running`);

  return (
    <div className="border-b border-neutral-100 px-3 py-2.5" aria-live="polite">
      <p className="text-[16px] font-semibold tabular-nums text-neutral-900">
        Charged {formatCredits(totals.charged)}
      </p>
      {lines.length > 0 && (
        <ul className="mt-0.5 text-[12px] leading-5 tabular-nums text-neutral-600">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {allStub && (
        <p className="mt-1 text-[12px] leading-5 text-neutral-600">
          Stub mode: no provider was called, so nothing was charged.
        </p>
      )}
    </div>
  );
}

function JobRow({ row, allStub }: { row: LedgerRow; allStub: boolean }) {
  const credits = creditsText(row);
  // When the whole run was stub, the notice above says why once instead of on every row.
  const reason = allStub ? null : reasonOf(row.charge);

  return (
    <li data-slot="ledger-row" data-status={row.status} data-charge={row.charge.kind} className="px-3 py-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[13px] leading-5">
        <span className="truncate font-medium text-neutral-900">{modelName(row)}</span>
        <span className={cn("text-right font-medium", row.charge.kind === "not-stated" ? "text-amber-800" : "text-neutral-900")}>
          {chargeLabel(row.charge)}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[12px] text-neutral-600">
          {row.provider && <span>{PROVIDER_NAMES[row.provider]}</span>}
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_COLOR[row.status])} />
            {STATUS_WORD[row.status]}
          </span>
        </span>
        <span
          className={cn("text-right text-[12px] tabular-nums", credits.reported ? "text-neutral-900" : "text-neutral-600")}
          title={credits.reported ? "Reported by the provider for this task" : "List-price estimate; nothing was reported"}
        >
          {credits.text}
        </span>
      </div>
      {row.error && <p className="mt-1 break-words text-[12px] leading-4 text-red-700">{row.error}</p>}
      {reason && <p className="mt-1 text-[12px] leading-4 text-neutral-600">{reason}</p>}
      {row.status === "failed" && row.provider === "runway" && row.charge.kind !== "none" && (
        <a
          href={RUNWAY_FAILURES_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-[12px] text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
        >
          Read Runway&apos;s failure codes
        </a>
      )}
    </li>
  );
}
