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
}) => Promise<Patch<K>>;

async function postJson<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
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
  return async ({ data, inputs }) => {
    const { url } = await postJson<{ url: string }>(endpoint, {
      data: { ...data, prompt: effectivePrompt(inputs.texts, data.prompt) },
      inputs: { ...inputs, texts: [] },
    });
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

  composition: async ({ inputs }) => urlPatch(inputs.videos[0] ?? ""),

  // Nothing to generate: the clip itself goes out on the video handle, for a
  // wire drawn from it by hand.
  reference: async ({ data }) => ({ outputUrl: data.clipUrl }),

  // A chip can be pinned while the roll is in flight, and pins win, so the
  // merge runs against the node as it is when the roll lands.
  cluster: async ({ data, inputs }) => {
    const roll = await rollCluster(data, inputs);
    return (fresh) => ({
      groups: rerollGroups(fresh.groups, roll.groups, fresh.pinned),
      outputTexts: toOutputTexts(fresh.pinned),
      stub: roll.stub,
    });
  },
} satisfies { [K in NodeKind]: Runner<K> };
