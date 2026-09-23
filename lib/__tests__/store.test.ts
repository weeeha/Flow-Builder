import { beforeEach, describe, expect, it } from "vitest";
import { NODE_KINDS, NODE_KIND_LIST, initialData } from "../node-kinds";
import { useFlowStore } from "../store";
import type { FlowDoc } from "../flow-doc";
import { handleId, parseHandleId } from "../handles";
import type { FlowNode, NodeKind } from "../types";
import fixture from "../stubs/clip-analysis.json";

const nodeAt = (id: string) => useFlowStore.getState().nodes.find((n) => n.id === id)!;

beforeEach(() => {
  useFlowStore.setState({ nodes: [], edges: [] });
});

describe("addNode", () => {
  it.each(NODE_KIND_LIST)("starts a %s node on the registry's initial data", (kind) => {
    const id = useFlowStore.getState().addNode(kind, { x: 10, y: 20 });
    const node = nodeAt(id);
    expect(node.type).toBe(kind);
    expect(node.position).toEqual({ x: 10, y: 20 });
    expect(node.data).toEqual(initialData(kind));
    expect(node.data.status).toBe("idle");
  });

  it("gives two nodes of one kind separate data, so editing one leaves the other alone", () => {
    const first = useFlowStore.getState().addNode("cluster", { x: 0, y: 0 });
    const second = useFlowStore.getState().addNode("cluster", { x: 0, y: 0 });
    expect(nodeAt(first).data).not.toBe(nodeAt(second).data);
    useFlowStore.getState().updateNodeData(first, { prompt: "a lighthouse at dusk" });
    expect(nodeAt(second).data.prompt).toBe("");
  });

  it("never puts a colon in an id, because ids are the first segment of a handle id", () => {
    for (const kind of NODE_KIND_LIST) {
      const id = useFlowStore.getState().addNode(kind, { x: 0, y: 0 });
      expect(id.startsWith(`${kind}-`)).toBe(true);
      expect(id.slice(kind.length + 1)).not.toContain(":");
    }
  });

  it("covers every kind the toolbar can add", () => {
    expect(NODE_KIND_LIST).toEqual(Object.keys(NODE_KINDS) as NodeKind[]);
  });
});

describe("loadGraph", () => {
  const graph = fixture.graph as FlowDoc;
  const load = (doc: FlowDoc = graph, origin = { x: 100, y: 200 }) =>
    useFlowStore.getState().loadGraph(doc, { origin });

  it("adds the graph beside what is already on the canvas and leaves that alone", () => {
    const existing = useFlowStore.getState().addNode("image", { x: 5, y: 5 });
    const before = nodeAt(existing);
    load();
    const { nodes, edges } = useFlowStore.getState();
    expect(nodes).toHaveLength(1 + graph.nodes.length);
    expect(edges).toHaveLength(graph.edges.length);
    expect(nodeAt(existing)).toBe(before);
  });

  it("lands two copies when called twice, with no id shared between them", () => {
    load();
    load();
    const { nodes, edges } = useFlowStore.getState();
    expect(nodes).toHaveLength(2 * graph.nodes.length);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });

  it("rewrites every edge onto the new ids with the handle types unchanged", () => {
    const ids = load();
    const { nodes, edges } = useFlowStore.getState();
    for (const [i, e] of edges.entries()) {
      const from = graph.edges[i];
      expect(e.source).toBe(ids[from.source]);
      expect(e.target).toBe(ids[from.target]);
      expect(e.sourceHandle).toBe(handleId(e.source, parseHandleId(from.sourceHandle)!.type));
      expect(e.targetHandle).toBe(handleId(e.target, parseHandleId(from.targetHandle)!.type));
      expect(nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target)).toBe(true);
    }
  });

  it("starts each node on its kind's initial data with the document's params on top", () => {
    const ids = load();
    const video = nodeAt(ids["video-1"]) as Extract<FlowNode, { type: "video" }>;
    expect(video.type).toBe("video");
    expect(video.data).toEqual({
      ...initialData("video"),
      prompt: graph.nodes[1].data.prompt,
      model: "seedance-2.0",
      duration: 6,
    });
    expect(nodeAt(ids["composition-1"]).data).toEqual(initialData("composition"));
  });

  it("places nodes by layoutGraph from the origin", () => {
    const ids = load(graph, { x: 1000, y: 40 });
    expect(nodeAt(ids["image-1"]).position).toEqual({ x: 1000, y: 40 });
    expect(nodeAt(ids["video-1"]).position.x).toBeGreaterThan(1000);
  });

  it("keeps a kind's default for a param value the registry does not offer", () => {
    const doc: FlowDoc = {
      version: 1,
      nodes: [{ id: "video-1", kind: "video", data: { prompt: "p", model: "sora-9", duration: 5, style: "noir" } }],
      edges: [],
    };
    const ids = load(doc);
    const data = nodeAt(ids["video-1"]).data;
    expect(data.model).toBe(initialData("video").model);
    expect(data.duration).toBe(initialData("video").duration);
    expect(data).not.toHaveProperty("style");
  });
});
