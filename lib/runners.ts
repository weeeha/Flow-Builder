import type { RouteReceipt } from "./charge";
import { rerollGroups, toOutputTexts } from "./cluster";
import type { DataOf } from "./node-kinds";
import { effectivePrompt } from "./prompt";
import type { ClusterGroup, ClusterNodeData, NodeInputs, NodeKind } from "./types";

/**
 * What running a node does, per kind: a client function that resolves to a data
 * patch. The executor owns status, ordering and writing the patch; a runner only
 * turns data and wired inputs into new data.
 *
 * Kept apart from the cards because cards import the executor for their Run
 * button, and from NODE_KINDS because that table stays free of fetch and React.
 */

/**
 * A patch merges into the node's data. The function form reads the node as it is
 * when the run lands, for a kind whose data can change while it is in flight.
 */
export type Patch<K extends NodeKind> =
  | Partial<DataOf<K>>
  | ((fresh: DataOf<K>) => Partial<DataOf<K>>);

export type Runner<K extends NodeKind> = (ctx: {
  data: DataOf<K>;
  inputs: NodeInputs;
  /** Hands the executor what the route said about the job's cost. */
  report?: (receipt: RouteReceipt) => void;
}) => Promise<Patch<K>>;

/**
 * A route that answered with an error status. Keeps the parsed JSON body, so a
 * failed task's reported cost reaches the ledger along with the message.
 */
export class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly text: string,
    readonly body?: Record<string, unknown>
  ) {
    // A JSON error body reads as its message, not as the raw object.
    super(`${status} ${typeof body?.error === "string" ? body.error : text}`);
    this.name = "RouteError";
  }
}

/** The receipt fields of a route's JSON reply, when it sent any. */
export function receiptOf(body: unknown): RouteReceipt | undefined {
  if (!body || typeof body !== "object" || !("stub" in body)) return undefined;
  const b = body as Partial<RouteReceipt>;
  return {
    stub: b.stub === true,
    ...(b.refused ? { refused: true } : {}),
    ...(typeof b.cost === "number" ? { cost: b.cost } : {}),
    ...(b.costMissing ? { costMissing: b.costMissing } : {}),
  };
}

async function postJson<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    throw new RouteError(res.status, text, parsed);
  }
  return (await res.json()) as T;
}

/** A url result writes videoUrl beside outputUrl; the composition card reads videoUrl. */
function urlPatch(url: string) {
  return { outputUrl: url, videoUrl: url };
}

/**
 * The standard runner for a generation route. The routes each join inputs.texts
 * into the prompt themselves, so wired text is folded into data.prompt here and
 * texts goes out empty, or it would land twice.
 */
function postRoute<K extends "image" | "video" | "tts">(endpoint: string): Runner<K> {
  return async ({ data, inputs, report }) => {
    const reply = await postJson<{ url: string } & Partial<RouteReceipt>>(endpoint, {
      data: { ...data, prompt: effectivePrompt(inputs.texts, data.prompt) },
      inputs: { ...inputs, texts: [] },
    });
    const receipt = receiptOf(reply);
    if (receipt) report?.(receipt);
    const { url } = reply;
    // K is still open here, so the compiler cannot see that every one of these
    // kinds takes outputUrl; videoUrl rides BaseNodeData's index signature.
    return urlPatch(url) as unknown as Partial<DataOf<K>>;
  };
}

export type ClusterRoll = { groups: ClusterGroup[]; stub: boolean };

/**
 * One roll for a cluster node: a POST to the cluster route, which answers from
 * the local fixture when no LLM key is set. Exported for the per-group re-roll,
 * which fetches the same way and merges differently.
 */
export async function rollCluster(data: ClusterNodeData, inputs: NodeInputs): Promise<ClusterRoll> {
  const prompt = effectivePrompt(inputs.texts, data.prompt);
  if (!prompt) {
    throw new Error("Prompt is empty");
  }
  return postJson<ClusterRoll>("/api/generate/cluster", {
    data: { ...data, prompt },
    inputs: { ...inputs, texts: [] },
  });
}

/**
 * Keyed by kind and closed with `satisfies`, so the compiler reports a kind
 * without a runner.
 */
export const RUNNERS = {
  image: postRoute<"image">("/api/generate/image"),
  video: postRoute<"video">("/api/generate/video"),
  tts: postRoute<"tts">("/api/generate/speech"),

  // audioUrl is always written, so unwiring the audio clears the track on the next run.
  composition: async ({ inputs }) => ({ ...urlPatch(inputs.videos[0] ?? ""), audioUrl: inputs.audios[0] }),

  // Nothing to generate: the clip itself goes out on the video handle, for a
  // wire drawn from it by hand.
  reference: async ({ data }) => ({ outputUrl: data.clipUrl }),

  // A chip can be pinned while the roll is in flight, and pins win, so the
  // merge runs against the node as it is when the roll lands.
  cluster: async ({ data, inputs, report }) => {
    const roll = await rollCluster(data, inputs);
    report?.({ stub: roll.stub });
    return (fresh) => ({
      groups: rerollGroups(fresh.groups, roll.groups, fresh.pinned),
      outputTexts: toOutputTexts(fresh.pinned),
      stub: roll.stub,
    });
  },
} satisfies { [K in NodeKind]: Runner<K> };
