import { z } from "zod";
import { markLostClips } from "../clip-upload";
import { NODE_KIND_LIST, initialData } from "../node-kinds";
import type { FlowEdge, FlowNode, NodeKind } from "../types";
import type { FlowPreview } from "./preview";

/**
 * A flow as a document: what is stored in IndexedDB and what a .flow.json holds.
 * Every file carries `version`; `migrate` lifts older ones, so a saved flow keeps
 * opening after the format changes.
 */
export const CURRENT_VERSION = 1;

export interface FlowFile {
  format: "flow-builder";
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** What the home page reads: enough for a card, never the full flow. */
export interface FlowSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  preview: FlowPreview;
}

export class FlowFormatError extends Error {}

const now = () => new Date().toISOString();

export function newFlowFile(name: string, nodes: FlowNode[] = [], edges: FlowEdge[] = []): FlowFile {
  const at = now();
  return { format: "flow-builder", version: CURRENT_VERSION, id: crypto.randomUUID(), name, createdAt: at, updatedAt: at, nodes, edges };
}

/** Position and data only, run state reset, dead clip URLs dropped. */
export function toSavedNodes(nodes: FlowNode[]): FlowNode[] {
  return markLostClips(nodes).map((node) => {
    const { error: _error, ...data } = node.data as Record<string, unknown>;
    void _error;
    return { id: node.id, type: node.type, position: node.position, data: { ...data, status: "idle" } } as FlowNode;
  });
}

export function toSavedEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle }));
}

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});
const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});
const FileSchema = z.object({
  format: z.literal("flow-builder"),
  version: z.number().int(),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
const LegacySchema = z.object({
  state: z.object({ nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  version: z.literal(0).optional(),
});

/** Lift any known shape to the current version. Checks kinds and edge ends. */
export function migrate(raw: unknown): FlowFile {
  const legacy = LegacySchema.safeParse(raw);
  if (legacy.success) {
    return check(newFlowFile("Untitled flow", legacy.data.state.nodes as FlowNode[], legacy.data.state.edges as FlowEdge[]));
  }
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) throw new FlowFormatError("This isn't a Flow Builder file");
  if (parsed.data.version > CURRENT_VERSION) throw new FlowFormatError("This flow was saved by a newer Flow Builder");
  // Version 1 is the first file version; later versions add steps here, in order.
  return check(parsed.data as unknown as FlowFile);
}

function check(file: FlowFile): FlowFile {
  const ids = new Set(file.nodes.map((n) => n.id));
  for (const node of file.nodes) {
    if (!NODE_KIND_LIST.includes(node.type as NodeKind)) throw new FlowFormatError(`Unknown node kind "${node.type}"`);
  }
  for (const edge of file.edges) {
    for (const end of [edge.source, edge.target]) {
      if (!ids.has(end)) throw new FlowFormatError(`An edge points at "${end}", which isn't in the flow`);
    }
  }
  const nodes = file.nodes.map((node) => ({ ...node, data: { ...initialData(node.type), ...node.data } }) as FlowNode);
  return { ...file, nodes };
}

export function parseImport(text: string): FlowFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FlowFormatError("This file isn't valid JSON");
  }
  const file = migrate(raw);
  const at = now();
  return { ...file, id: crypto.randomUUID(), createdAt: at, updatedAt: at, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges) };
}

export function toExportText(file: FlowFile): string {
  return JSON.stringify({ ...file, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges) }, null, 2);
}
