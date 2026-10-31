"use client";

import type { FlowEdge, FlowNode, NodeInputs, NodeKind } from "./types";
import { chargeFor, providerFor, type RouteReceipt } from "./charge";
import { rerollGroup, toOutputTexts } from "./cluster";
import { parseHandleId } from "./handles";
import { useLedger } from "./ledger";
import type { DataOf } from "./node-kinds";
import { estimateNode } from "./pricing";
import { RUNNERS, RouteError, receiptOf, rollCluster, type Patch, type Runner } from "./runners";
import { useFlowStore } from "./store";

/**
 * Collects what is wired into a node, bucketed by the type of the source handle
 * each edge leaves from. A text edge carries the source's named port text when the
 * handle has a port, and its plain `outputText` otherwise.
 */
export function gatherInputs(
  nodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): NodeInputs {
  const inputs: NodeInputs = { texts: [], images: [], videos: [], audios: [] };
  for (const edge of edges.filter((e) => e.target === nodeId)) {
    const source = nodes.find((n) => n.id === edge.source);
    const handle = parseHandleId(edge.sourceHandle);
    if (!source || !handle) continue;
    if (handle.type === "text") {
      const text = handle.port
        ? source.data.outputTexts?.[handle.port]
        : source.data.outputText;
      if (text) inputs.texts.push(text);
      continue;
    }
    const data = source.data as Record<string, unknown>;
    const url = data.outputUrl as string | undefined;
    if (!url) continue;
    if (handle.type === "image") inputs.images.push(url);
    else if (handle.type === "video") inputs.videos.push(url);
    else inputs.audios.push(url);
  }
  return inputs;
}

function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const edge of edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id);
  const result: FlowNode[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (node) result.push(node);
    for (const edge of edges.filter((e) => e.source === id)) {
      const newDeg = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, newDeg);
      if (newDeg === 0) queue.push(edge.target);
    }
  }
  return result;
}

/**
 * Write a runner's patch into a node. The node is read again first: the function
 * form merges into whatever changed while the run was in flight, and a node
 * deleted or replaced meanwhile is left alone.
 */
function applyPatch<K extends NodeKind>(nodeId: string, kind: K, patch: Patch<K>) {
  const { nodes, updateNodeData } = useFlowStore.getState();
  const fresh = nodes.find((n) => n.id === nodeId);
  if (fresh?.type !== kind) return;
  const data = fresh.data as DataOf<K>;
  updateNodeData(nodeId, typeof patch === "function" ? patch(data) : patch);
}

let rowCounter = 0;

export async function runSingleNode(nodeId: string) {
  const { nodes, edges, setNodeStatus } = useFlowStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  setNodeStatus(nodeId, "running");

  // Only jobs that reach a provider get a row; a reference or composition
  // passing its input along has no money in it.
  const provider = providerFor(node);
  const rowId = `job-${++rowCounter}`;
  if (provider) {
    useLedger.getState().addRow({
      id: rowId,
      nodeId,
      kind: node.type,
      model: typeof node.data.model === "string" ? node.data.model : undefined,
      provider,
      status: "running",
      estimate: estimateNode(node),
      charge: { kind: "pending" },
    });
  }
  let receipt: RouteReceipt | undefined;

  try {
    // TypeScript cannot correlate node.type with node.data through a record lookup.
    const run = RUNNERS[node.type] as Runner<NodeKind>;
    const patch = await run({
      data: node.data,
      inputs: gatherInputs(nodeId, nodes, edges),
      report: (r) => (receipt = r),
    });
    applyPatch(nodeId, node.type, patch);
    setNodeStatus(nodeId, "done");
    if (provider) {
      useLedger.getState().finishRow(rowId, { status: "done", charge: chargeFor("done", provider, receipt) });
    }
  } catch (err) {
    const message = (err as Error).message;
    setNodeStatus(nodeId, "error", message);
    if (provider) {
      // A failed route still sends its receipt, in the error body.
      const body = err instanceof RouteError ? err.body : undefined;
      useLedger.getState().finishRow(rowId, {
        status: "failed",
        charge: chargeFor("failed", provider, receiptOf(body) ?? receipt),
        error: typeof body?.error === "string" ? body.error : message,
      });
    }
  }
}

/**
 * Re-roll one group of a cluster node. The roll is fetched the same way Run
 * fetches it; only that group's unpinned chips take from it.
 */
export async function rerollClusterGroup(nodeId: string, groupId: string) {
  const { nodes, edges, setNodeStatus } = useFlowStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.type !== "cluster") return;
  setNodeStatus(nodeId, "running");
  try {
    const roll = await rollCluster(node.data, gatherInputs(nodeId, nodes, edges));
    applyPatch(nodeId, "cluster", (fresh) => ({
      groups: rerollGroup(fresh.groups, roll.groups, fresh.pinned, groupId),
      outputTexts: toOutputTexts(fresh.pinned),
      stub: roll.stub,
    }));
    setNodeStatus(nodeId, "done");
  } catch (err) {
    setNodeStatus(nodeId, "error", (err as Error).message);
  }
}

export async function runAll() {
  useLedger.getState().startRun();
  const state = useFlowStore.getState();
  const order = topologicalSort(state.nodes, state.edges);
  for (const node of order) {
    await runSingleNode(node.id);
    const fresh = useFlowStore.getState().nodes.find((n) => n.id === node.id);
    if (fresh?.data.status === "error") break;
  }
}
