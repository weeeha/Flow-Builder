import { beforeEach, describe, expect, it } from "vitest";
import { NODE_KINDS, NODE_KIND_LIST, initialData } from "../node-kinds";
import { useFlowStore } from "../store";
import type { NodeKind } from "../types";

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
