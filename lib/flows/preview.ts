/** What a flow card draws: the graph as kinds and positions, or its first image. */
export interface FlowPreview {
  nodes: { kind: string; x: number; y: number }[];
  edges: [number, number][];
  image?: string;
}
