import { beforeEach, describe, expect, it } from "vitest";
import { branchFromPin } from "../branch";
import { assignIds } from "../cluster";
import { handleId } from "../handles";
import { useFlowStore } from "../store";
import fixture from "../stubs/cluster.json";
import type { FlowNode } from "../types";

const groups = assignIds(fixture.sets[0].groups);
const pin = { ...groups[0].suggestions[0], axis: groups[0].axis };
const cluster: FlowNode = {
  id: "cluster-1",
  type: "cluster",
  position: { x: 100, y: 200 },
  data: {
    status: "idle",
    prompt: "a lighthouse at dusk",
    groups,
    pinned: [pin],
    outputTexts: { [pin.id]: pin.text },
  },
};

beforeEach(() => {
  useFlowStore.setState({ nodes: [cluster], edges: [] });
});

describe("branchFromPin", () => {
  it("adds a video node to the right of the cluster, wired from the pin's text port", () => {
    const target = branchFromPin("video", "cluster-1", pin.id);
    const { nodes, edges } = useFlowStore.getState();
    const video = nodes.find((n) => n.id === target);
    expect(video?.type).toBe("video");
    expect(video!.position.x).toBeGreaterThan(cluster.position.x);
    expect(edges).toEqual([
      expect.objectContaining({
        source: "cluster-1",
        sourceHandle: handleId("cluster-1", "text", pin.id),
        target,
        targetHandle: handleId(target!, "text"),
      }),
    ]);
  });

  it("adds an image node the same way", () => {
    const target = branchFromPin("image", "cluster-1", pin.id);
    const { nodes, edges } = useFlowStore.getState();
    expect(nodes.find((n) => n.id === target)?.type).toBe("image");
    expect(edges).toHaveLength(1);
  });

  it("lines the new node's text handle up with the pin's row", () => {
    // The row sits 150 flow units below the cluster's top; a card's text handle sits 24 below its own.
    const target = branchFromPin("video", "cluster-1", pin.id, 150);
    const video = useFlowStore.getState().nodes.find((n) => n.id === target);
    expect(video!.position.y).toBe(200 + 150 - 24);
  });

  it("slides below a node already sitting where the new one would land", () => {
    const first = branchFromPin("video", "cluster-1", pin.id);
    const second = branchFromPin("video", "cluster-1", pin.id);
    const { nodes } = useFlowStore.getState();
    const a = nodes.find((n) => n.id === first)!;
    const b = nodes.find((n) => n.id === second)!;
    expect(b.position.x).toBe(a.position.x);
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it("does nothing when the cluster is gone", () => {
    expect(branchFromPin("video", "missing", pin.id)).toBeNull();
    expect(useFlowStore.getState().nodes).toHaveLength(1);
    expect(useFlowStore.getState().edges).toEqual([]);
  });
});
