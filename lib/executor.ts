"use client";

import type { ClusterGroup, FlowEdge, FlowNode } from "./types";
import { nextStubGroups, rerollGroups, toOutputTexts } from "./cluster";
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

type RunResult =
  | { kind: "url"; url: string }
  | { kind: "cluster"; groups: ClusterGroup[]; stub: boolean };

/** Long enough for the skeleton chips to read as loading. */
const STUB_ROLL_MS = 600;

async function runNode(node: FlowNode, inputs: NodeInputs): Promise<RunResult> {
  if (node.type === "cluster") {
    if (!effectivePrompt(inputs.texts, node.data.prompt)) {
      throw new Error("Prompt is empty");
    }
    // Thin slice: resolves the local fixture directly, no fetch. Plan task 10
    // replaces this with a POST to /api/generate/cluster.
    await new Promise((resolve) => setTimeout(resolve, STUB_ROLL_MS));
    return { kind: "cluster", groups: nextStubGroups(node.data.groups), stub: true };
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
      // Read the node again: a chip can be pinned while the roll is in flight, and pins win.
      const fresh = useFlowStore.getState().nodes.find((n) => n.id === nodeId);
      if (fresh?.type === "cluster") {
        updateNodeData(nodeId, {
          groups: rerollGroups(fresh.data.groups, result.groups, fresh.data.pinned),
          outputTexts: toOutputTexts(fresh.data.pinned),
          stub: result.stub,
        });
      }
    } else {
      updateNodeData(nodeId, { outputUrl: result.url, videoUrl: result.url });
    }
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
