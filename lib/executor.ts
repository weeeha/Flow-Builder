"use client";

import type { ClusterGroup, FlowEdge, FlowNode, PinnedSuggestion } from "./types";
import { nextStubGroups, rerollGroup, rerollGroups, toOutputTexts } from "./cluster";
import { parseHandleId } from "./handles";
import { effectivePrompt } from "./prompt";
import { useFlowStore } from "./store";

interface NodeInputs {
  texts: string[];
  images: string[];
  videos: string[];
  audios: string[];
}

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

type ClusterRoll = { groups: ClusterGroup[]; stub: boolean };
type ClusterNode = Extract<FlowNode, { type: "cluster" }>;

type RunResult = { kind: "url"; url: string } | ({ kind: "cluster" } & ClusterRoll);

/** Long enough for the skeleton chips to read as loading. */
const STUB_ROLL_MS = 600;

/**
 * One roll for a cluster node. Thin slice: resolves the local fixture directly,
 * no fetch. Plan task 10 replaces this with a POST to /api/generate/cluster.
 */
async function rollCluster(node: ClusterNode, inputs: NodeInputs): Promise<ClusterRoll> {
  if (!effectivePrompt(inputs.texts, node.data.prompt)) {
    throw new Error("Prompt is empty");
  }
  await new Promise((resolve) => setTimeout(resolve, STUB_ROLL_MS));
  return { groups: nextStubGroups(node.data.groups), stub: true };
}

/**
 * Write a roll into a cluster node. Reads the node again first: a chip can be
 * pinned while the roll is in flight, and pins win.
 */
function applyClusterRoll(
  nodeId: string,
  roll: ClusterRoll,
  merge: (current: ClusterGroup[], fresh: ClusterGroup[], pinned: PinnedSuggestion[]) => ClusterGroup[]
) {
  const { nodes, updateNodeData } = useFlowStore.getState();
  const fresh = nodes.find((n) => n.id === nodeId);
  if (fresh?.type !== "cluster") return;
  updateNodeData(nodeId, {
    groups: merge(fresh.data.groups, roll.groups, fresh.data.pinned),
    outputTexts: toOutputTexts(fresh.data.pinned),
    stub: roll.stub,
  });
}

async function runNode(node: FlowNode, inputs: NodeInputs): Promise<RunResult> {
  if (node.type === "cluster") {
    return { kind: "cluster", ...(await rollCluster(node, inputs)) };
  }

  const endpoint =
    node.type === "image"
      ? "/api/generate/image"
      : node.type === "video"
      ? "/api/generate/video"
      : node.type === "tts"
      ? "/api/generate/speech"
      : null;

  if (!endpoint) {
    if (node.type === "composition") {
      return { kind: "url", url: inputs.videos[0] ?? "" };
    }
    throw new Error(`No runner for node type ${node.type}`);
  }

  // The routes each join inputs.texts into the prompt themselves. Wired text is
  // folded into data.prompt here instead, so texts goes out empty or it lands twice.
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: { ...node.data, prompt: effectivePrompt(inputs.texts, node.data.prompt) },
      inputs: { ...inputs, texts: [] },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  const json = (await res.json()) as { url: string };
  return { kind: "url", url: json.url };
}

export async function runSingleNode(nodeId: string) {
  const { nodes, edges, setNodeStatus, updateNodeData } = useFlowStore.getState();
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return;
  setNodeStatus(nodeId, "running");
  try {
    const inputs = gatherInputs(nodeId, nodes, edges);
    const result = await runNode(node, inputs);
    if (result.kind === "cluster") {
      applyClusterRoll(nodeId, result, rerollGroups);
    } else {
      updateNodeData(nodeId, { outputUrl: result.url, videoUrl: result.url });
    }
    setNodeStatus(nodeId, "done");
  } catch (err) {
    setNodeStatus(nodeId, "error", (err as Error).message);
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
    const roll = await rollCluster(node, gatherInputs(nodeId, nodes, edges));
    applyClusterRoll(nodeId, roll, (current, fresh, pinned) =>
      rerollGroup(current, fresh, pinned, groupId)
    );
    setNodeStatus(nodeId, "done");
  } catch (err) {
    setNodeStatus(nodeId, "error", (err as Error).message);
  }
}

export async function runAll() {
  const state = useFlowStore.getState();
  const order = topologicalSort(state.nodes, state.edges);
  for (const node of order) {
    await runSingleNode(node.id);
    const fresh = useFlowStore.getState().nodes.find((n) => n.id === node.id);
    if (fresh?.data.status === "error") break;
  }
}
