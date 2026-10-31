import { providerOf } from "./models";
import type { FlowNode } from "./types";

/**
 * What happened to the money for one job, kept apart from what happened to the
 * job. A failed job can be charged, refunded, or nobody can say; folding that
 * into the status badge is how products hide it.
 */
export type Charge =
  /** The job is still running. */
  | { kind: "pending" }
  /** The provider reported this many credits for the task. */
  | { kind: "charged"; credits: number }
  /** The provider reported 0 for a failed task. */
  | { kind: "refunded" }
  /** The job reached a paid provider, which reported no cost and publishes no rule we can apply. */
  | { kind: "not-stated"; reason: string }
  /** No paid provider was called. */
  | { kind: "none"; reason: string };

/** Who bills a node's run. null when the node runs in the browser. */
export type Provider = "runway" | "fal" | "elevenlabs" | "gateway";

export function providerFor(node: FlowNode): Provider | null {
  switch (node.type) {
    case "video":
      return providerOf(node.data.model);
    case "image":
      return "fal";
    case "tts":
      return "elevenlabs";
    case "cluster":
      return "gateway";
    case "composition":
    case "reference":
      return null;
  }
}

/**
 * What a generation route says about the job beside its result. Runway reports
 * `cost.credits` on every finished task, failed ones included, and 0 for a full
 * refund (@runwayml/sdk 4.20.0, TaskRetrieveResponse). The other providers here
 * report nothing per job.
 */
export interface RouteReceipt {
  /** True when no provider was called: no key, or the check scripts' stub cookie. */
  stub: boolean;
  /** True when the route turned the request down itself, before calling a provider. */
  refused?: boolean;
  /** Credits the provider reported for this task. */
  cost?: number;
  /** Why a provider that reports cost did not: we stopped waiting, or no task was created. */
  costMissing?: "timed-out" | "rejected";
}

const NO_REPORT: Record<Exclude<Provider, "runway">, string> = {
  fal: "fal reports no cost per job. It states that server errors are not billed.",
  elevenlabs: "ElevenLabs reports no cost per job.",
  gateway: "The AI Gateway reports no cost per call here.",
};

function runwayReason(costMissing: RouteReceipt["costMissing"]): string {
  if (costMissing === "timed-out") {
    return "Flow Builder stopped waiting. The task may still finish, and bill, at Runway.";
  }
  if (costMissing === "rejected") {
    return "Runway rejected the request before a task existed, so there is no task cost to read.";
  }
  return "Runway did not report a cost for this task.";
}

/** The charge for a finished job, from its outcome and the route's receipt. */
export function chargeFor(
  outcome: "done" | "failed",
  provider: Provider | null,
  receipt?: RouteReceipt
): Charge {
  if (!provider) return { kind: "none", reason: "Runs in your browser. No provider was called." };
  if (receipt?.stub) return { kind: "none", reason: "Stub mode. No provider was called." };
  if (receipt?.refused) {
    return { kind: "none", reason: "Flow Builder turned the request down before calling a provider." };
  }
  if (typeof receipt?.cost === "number") {
    return outcome === "failed" && receipt.cost === 0
      ? { kind: "refunded" }
      : { kind: "charged", credits: receipt.cost };
  }
  if (!receipt) return { kind: "not-stated", reason: "The route sent no receipt for this job." };
  return {
    kind: "not-stated",
    reason: provider === "runway" ? runwayReason(receipt.costMissing) : NO_REPORT[provider],
  };
}

/** The one word every charge state carries, so it never rests on colour alone. */
export function chargeLabel(charge: Charge): string {
  switch (charge.kind) {
    case "pending":
      return "Pending";
    case "charged":
      return "Charged";
    case "refunded":
      return "Refunded";
    case "not-stated":
      return "Not stated";
    case "none":
      return "Nothing charged";
  }
}
