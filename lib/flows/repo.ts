import { createStore, get, promisifyRequest } from "idb-keyval";
import type { FlowEdge, FlowNode } from "../types";
import { newFlowFile, toSavedEdges, toSavedNodes, type FlowFile, type FlowSummary } from "./format";
import { previewOf } from "./preview";

/**
 * Flows live in IndexedDB: one database, one store, keys `flow:<id>` for each
 * flow and `index` for the summaries the home page reads. A save writes both in
 * one transaction, so the list never disagrees with the flows.
 */
export const kv = createStore("flow-builder", "kv");
const INDEX = "index";
const key = (id: string) => `flow:${id}`;

export class FlowConflictError extends Error {}

type Index = Record<string, FlowSummary>;

const summaryOf = (file: FlowFile): FlowSummary => ({
  id: file.id, name: file.name, createdAt: file.createdAt, updatedAt: file.updatedAt,
  nodeCount: file.nodes.length, preview: previewOf(file.nodes, file.edges),
});

/** Read-modify-write the index and one flow inside a single transaction. */
function write(id: string, next: (current: FlowFile | undefined, index: Index) => FlowFile | null): Promise<FlowFile | null> {
  return kv("readwrite", async (store) => {
    const [current, index] = await Promise.all([
      promisifyRequest<FlowFile | undefined>(store.get(key(id))),
      promisifyRequest<Index | undefined>(store.get(INDEX)).then((i) => i ?? {}),
    ]);
    const file = next(current, index);
    if (file) {
      store.put(file, key(file.id));
      store.put({ ...index, [file.id]: summaryOf(file) }, INDEX);
    } else {
      store.delete(key(id));
      const { [id]: _gone, ...rest } = index;
      void _gone;
      store.put(rest, INDEX);
    }
    await promisifyRequest(store.transaction);
    return file;
  });
}

export async function listFlows(): Promise<FlowSummary[]> {
  const index = (await get<Index>(INDEX, kv)) ?? {};
  return Object.values(index).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getFlow = (id: string) => get<FlowFile>(key(id), kv);

export async function saveFlow(file: FlowFile, opts: { expectedUpdatedAt?: string } = {}): Promise<FlowFile> {
  const saved = await write(file.id, (current) => {
    if (opts.expectedUpdatedAt && current && current.updatedAt !== opts.expectedUpdatedAt) {
      throw new FlowConflictError("This flow changed in another tab");
    }
    // Strictly later than what is stored, even within one millisecond, so the
    // other-tab guard can always tell two writes apart.
    const floor = Date.parse(current?.updatedAt ?? "") || 0;
    const stamp = new Date(Math.max(Date.now(), floor + 1)).toISOString();
    return { ...file, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges), updatedAt: stamp };
  });
  return saved!;
}

export async function createFlow(name = "Untitled flow", seed: { nodes: FlowNode[]; edges: FlowEdge[] } = { nodes: [], edges: [] }) {
  return saveFlow(newFlowFile(name, seed.nodes, seed.edges));
}

export async function duplicateFlow(id: string): Promise<FlowFile> {
  const source = await getFlow(id);
  if (!source) throw new Error("This flow doesn't exist");
  return createFlow(`${source.name} copy`, source);
}

export async function renameFlow(id: string, name: string): Promise<FlowFile> {
  const source = await getFlow(id);
  if (!source) throw new Error("This flow doesn't exist");
  return saveFlow({ ...source, name: name.trim() || source.name });
}

export async function deleteFlow(id: string): Promise<void> {
  await write(id, () => null);
}

/** False in a window where IndexedDB is missing or refuses to open. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await get(INDEX, kv);
    return true;
  } catch {
    return false;
  }
}
