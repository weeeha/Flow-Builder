import { z } from "zod";
import type { ClipBreakdown } from "./clip-schema";
import { parseHandleId } from "./handles";
import { VIDEO_MODELS } from "./models";
import { NODE_KINDS, initialData, type DataOf, type FieldSpec, type PortSpec } from "./node-kinds";
import type { HandleType } from "./types";

/**
 * A graph as data, the shape a model writes: kinds, flat params, and edges in
 * the app's handle grammar. `layoutGraph` places it and `loadGraph` in the store
 * turns it into nodes. Positions never live in the document.
 */

export const FlowDocNodeSchema = z.object({
  id: z.string(),
  // A loose string: validateGraph rejects an unreal kind with a message a repair
  // request can quote, which a parse failure could not.
  kind: z.string(),
  data: z
    .object({
      prompt: z.string().optional(),
      model: z.string().optional(),
      duration: z.number().optional(),
    })
    .passthrough(),
});

export const FlowDocEdgeSchema = z.object({
  source: z.string(),
  /** `${nodeId}:${handleType}`, the grammar of lib/handles.ts. */
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string(),
});

export const FlowDocSchema = z.object({
  version: z.literal(1),
  nodes: z.array(FlowDocNodeSchema),
  edges: z.array(FlowDocEdgeSchema),
});

export type FlowDoc = z.infer<typeof FlowDocSchema>;
export type FlowDocNode = z.infer<typeof FlowDocNodeSchema>;
export type FlowDocEdge = z.infer<typeof FlowDocEdgeSchema>;

/**
 * The kinds a model may put in a graph. A fixed list, never "whatever the
 * registry has": cluster and reference have ports too, and neither may come
 * from a model.
 */
export const MODEL_KINDS = ["image", "video", "tts", "composition"] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

const typesOf = (ports: readonly PortSpec[]) => ports.map((p) => p.type);

/** Each model kind's input and output handle types, read from NODE_KINDS. */
export const NODE_HANDLES = Object.fromEntries(
  MODEL_KINDS.map((kind) => [
    kind,
    { in: typesOf(NODE_KINDS[kind].inputs), out: typesOf(NODE_KINDS[kind].outputs) },
  ])
) as Record<ModelKind, { in: HandleType[]; out: HandleType[] }>;

const isModelKind = (kind: string): kind is ModelKind =>
  (MODEL_KINDS as readonly string[]).includes(kind);

export interface GraphError {
  /** Plain language, because a repair request quotes it back to the model. */
  message: string;
}

/**
 * [HAND] Nick's, plan task 3: whether one edge fits the type contract. The cases
 * it has to meet are in lib/__tests__/flow-doc.test.ts under `edgeIsValid`.
 * The open question is an unknown port on a known type: error or warning.
 *
 * Provisional until then: every edge passes, so validateGraph's other checks
 * still run. Nothing in the thin slice calls validateGraph on a live graph yet;
 * the repair loop (task 9) is the first caller that depends on this.
 */
export function edgeIsValid(edge: FlowDocEdge, nodes: FlowDocNode[]): boolean {
  void edge;
  void nodes;
  return true; // TODO(HAND)
}

/** Longest-path depth per node, from Kahn's algorithm. Nodes in a cycle stay at 0. */
function depths(doc: FlowDoc): { depth: Map<string, number>; unsorted: string[] } {
  const ids = doc.nodes.map((n) => n.id);
  const indegree = new Map(ids.map((id) => [id, 0]));
  const depth = new Map(ids.map((id) => [id, 0]));
  const edges = doc.edges.filter((e) => indegree.has(e.source) && indegree.has(e.target));
  for (const e of edges) indegree.set(e.target, indegree.get(e.target)! + 1);

  const queue = ids.filter((id) => indegree.get(id) === 0);
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    seen.add(id);
    for (const e of edges.filter((e) => e.source === id)) {
      depth.set(e.target, Math.max(depth.get(e.target)!, depth.get(id)! + 1));
      indegree.set(e.target, indegree.get(e.target)! - 1);
      if (indegree.get(e.target) === 0) queue.push(e.target);
    }
  }
  return { depth, unsorted: ids.filter((id) => !seen.has(id)) };
}

export function validateGraph(doc: FlowDoc): GraphError[] {
  const errors: GraphError[] = [];
  const add = (message: string) => errors.push({ message });
  const byId = new Map<string, FlowDocNode>();

  for (const node of doc.nodes) {
    if (byId.has(node.id)) add(`Two nodes share the id "${node.id}".`);
    byId.set(node.id, node);
    if (!isModelKind(node.kind)) {
      add(`Node ${node.id} has kind "${node.kind}"; use only ${MODEL_KINDS.slice(0, -1).join(", ")} or ${MODEL_KINDS.at(-1)}.`);
    }
  }

  const incoming = new Map<string, number>();
  for (const edge of doc.edges) {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source) add(`An edge to ${edge.target} comes from ${edge.source}, which is not in the graph.`);
    if (!target) add(`An edge from ${edge.source} goes to ${edge.target}, which is not in the graph.`);
    if (source?.kind === "composition") add(`${source.id} is a composition and has no outputs.`);
    if (source && target && !edgeIsValid(edge, doc.nodes)) {
      add(`The edge ${edge.sourceHandle} → ${edge.targetHandle} joins handles that do not fit.`);
    }
    incoming.set(edge.targetHandle, (incoming.get(edge.targetHandle) ?? 0) + 1);
  }

  // Only text takes several edges; the executor reads index 0 of everything else.
  for (const [handle, count] of incoming) {
    const parsed = parseHandleId(handle);
    if (parsed && parsed.type !== "text" && count > 1) {
      add(`${parsed.nodeId}'s ${parsed.type} input has ${count} edges; it takes one.`);
    }
  }

  const { unsorted } = depths(doc);
  if (unsorted.length) add(`The edges form a cycle through ${unsorted.join(", ")}.`);

  return errors;
}

/**
 * Column and row spacing for a laid-out graph, measured from the cards: the
 * widest (composition) is 420px and the tallest (video) about 360px, so each
 * step leaves a gap for the wire. The plan's 320 × 220 would overlap cards.
 */
export const COLUMN_GAP = 480;
export const ROW_GAP = 400;

/** Columns by topological depth, rows by document order within a column. */
export function layoutGraph(
  doc: FlowDoc,
  origin: { x: number; y: number }
): Record<string, { x: number; y: number }> {
  const { depth } = depths(doc);
  const rows = new Map<number, number>();
  const at: Record<string, { x: number; y: number }> = {};
  for (const node of doc.nodes) {
    const d = depth.get(node.id) ?? 0;
    const row = rows.get(d) ?? 0;
    rows.set(d, row + 1);
    at[node.id] = { x: origin.x + d * COLUMN_GAP, y: origin.y + row * ROW_GAP };
  }
  return at;
}

const MAX_SHOTS = 3;

/** The duration the video node offers that sits closest to an estimate. */
function snapDuration(seconds: number): number {
  const offered = NODE_KINDS.video.fields.duration.options.map((o) => o.value);
  return offered.reduce((best, d) => (Math.abs(d - seconds) < Math.abs(best - seconds) ? d : best));
}

const edge = (source: string, type: HandleType, target: string, targetType: HandleType): FlowDocEdge => ({
  source,
  sourceHandle: `${source}:${type}`,
  target,
  targetHandle: `${target}:${targetType}`,
});

/**
 * The fixed template, no model involved: image into video per shot, the first
 * video into the composition, and a tts into its audio unless the clip is known
 * to be silent. The tts speaks the summary, a placeholder until transcription.
 */
export function breakdownToGraph(breakdown: ClipBreakdown, hasAudio: boolean | "unknown"): FlowDoc {
  const nodes: FlowDocNode[] = [];
  const edges: FlowDocEdge[] = [];

  breakdown.shots.slice(0, MAX_SHOTS).forEach((shot, i) => {
    const image = `image-${i + 1}`;
    const video = `video-${i + 1}`;
    nodes.push({ id: image, kind: "image", data: { prompt: shot.imagePrompt } });
    nodes.push({
      id: video,
      kind: "video",
      data: {
        prompt: shot.videoPrompt,
        model: VIDEO_MODELS[0].id,
        duration: snapDuration(shot.durationEstimateSeconds),
      },
    });
    edges.push(edge(image, "image", video, "image"));
  });

  nodes.push({ id: "composition-1", kind: "composition", data: {} });
  edges.push(edge("video-1", "video", "composition-1", "video"));

  if (hasAudio !== false) {
    nodes.push({ id: "tts-1", kind: "tts", data: { prompt: breakdown.summary } });
    edges.push(edge("tts-1", "audio", "composition-1", "audio"));
  }

  return { version: 1, nodes, edges };
}

/**
 * A document node's data as a real node's: the kind's initial data, with each
 * document param on top only when the kind declares that field and, for a
 * select, offers that value. A model can name a model that does not exist.
 */
export function toNodeData<K extends ModelKind>(kind: K, data: FlowDocNode["data"]): DataOf<K> {
  const fields = NODE_KINDS[kind].fields as Record<string, FieldSpec | undefined>;
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const field = fields[key];
    if (!field || value === undefined) continue;
    if (field.control === "select" && !field.options.some((o) => o.value === value)) continue;
    params[key] = value;
  }
  // Every key in params was checked against the kind's own fields above.
  return { ...initialData(kind), ...params } as DataOf<K>;
}
