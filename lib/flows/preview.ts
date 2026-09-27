import type { FlowEdge, FlowNode } from "../types";

/** What a flow card draws: the graph as kinds and positions, or its first image. */
export interface FlowPreview {
  nodes: { kind: string; x: number; y: number }[];
  edges: [number, number][];
  image?: string;
}

const isHttp = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//.test(url);

export function previewOf(nodes: FlowNode[], edges: FlowEdge[]): FlowPreview {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const image = nodes.find((n) => n.type === "image" && isHttp(n.data.outputUrl))?.data.outputUrl as string | undefined;
  return {
    nodes: nodes.map((n) => ({ kind: n.type, x: n.position.x, y: n.position.y })),
    edges: edges.flatMap((e) => (index.has(e.source) && index.has(e.target) ? [[index.get(e.source)!, index.get(e.target)!] as [number, number]] : [])),
    ...(image ? { image } : {}),
  };
}
