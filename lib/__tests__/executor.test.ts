import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignIds } from "../cluster";
import { rerollClusterGroup, runAll, runSingleNode } from "../executor";
import { initialData } from "../node-kinds";
import { useFlowStore } from "../store";
import fixture from "../stubs/cluster.json";
import type { FlowNode } from "../types";

import { POST } from "@/app/api/generate/cluster/route";

// The executor's fetch lands on the real route handler, in stub mode (no key set).
const fetchSpy = vi.fn(async (url: string, init?: RequestInit): Promise<Response> =>
  POST(new Request(`http://localhost${url}`, init))
);

const groups = assignIds(fixture.sets[0].groups);
const pin = { ...groups[1].suggestions[0], axis: groups[1].axis };
const cluster: FlowNode = {
  id: "cluster-1",
  type: "cluster",
  position: { x: 0, y: 0 },
  data: {
    status: "done",
    prompt: "a lighthouse at dusk",
    groups,
    pinned: [pin],
    outputTexts: { [pin.id]: pin.text },
    stub: true,
  },
};

const clusterNode = () =>
  useFlowStore.getState().nodes.find((n) => n.id === "cluster-1") as Extract<FlowNode, { type: "cluster" }>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
  useFlowStore.setState({ nodes: [cluster], edges: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rerollClusterGroup", () => {
  it("re-rolls one group in stub mode and leaves the other groups and the pin alone", async () => {
    const done = rerollClusterGroup("cluster-1", groups[1].id);
    expect(clusterNode().data.status).toBe("running");
    await vi.runAllTimersAsync();
    await done;

    const after = clusterNode().data;
    expect(after.status).toBe("done");
    expect(after.groups[0]).toEqual(groups[0]);
    expect(after.groups[2]).toEqual(groups[2]);
    expect(after.groups[3]).toEqual(groups[3]);
    expect(after.groups[1].suggestions[0]).toEqual(groups[1].suggestions[0]);
    expect(after.groups[1].suggestions[1].text).toBe(fixture.sets[1].groups[1].suggestions[1].text);
    expect(after.outputTexts).toEqual({ [pin.id]: pin.text });
    expect(after.stub).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("/api/generate/cluster", expect.objectContaining({ method: "POST" }));
    const sent = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(sent.data.prompt).toBe("a lighthouse at dusk");
    expect(sent.inputs.texts).toEqual([]);
  });

  it("reports an empty prompt as an error instead of rolling", async () => {
    useFlowStore.setState({ nodes: [{ ...cluster, data: { ...cluster.data, prompt: "" } } as FlowNode] });
    await rerollClusterGroup("cluster-1", groups[1].id);
    expect(clusterNode().data.status).toBe("error");
    expect(clusterNode().data.error).toBe("Prompt is empty");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("runSingleNode", () => {
  it("writes a url result onto the node and marks it done", async () => {
    fetchSpy.mockImplementationOnce(async () => Response.json({ url: "https://example.test/out.png" }));
    const image: FlowNode = {
      id: "image-1",
      type: "image",
      position: { x: 0, y: 0 },
      data: { ...initialData("image"), prompt: "a lighthouse" },
    };
    useFlowStore.setState({ nodes: [image], edges: [] });

    await runSingleNode("image-1");

    const after = useFlowStore.getState().nodes[0].data;
    expect(after.status).toBe("done");
    expect(after.outputUrl).toBe("https://example.test/out.png");
    expect(after.videoUrl).toBe("https://example.test/out.png");
  });
});

describe("runAll", () => {
  it("stops at the first error and leaves later nodes idle", async () => {
    fetchSpy.mockImplementationOnce(async () => new Response("nope", { status: 500 }));
    const image: FlowNode = {
      id: "image-1",
      type: "image",
      position: { x: 0, y: 0 },
      data: { ...initialData("image"), prompt: "a lighthouse" },
    };
    const video: FlowNode = {
      id: "video-1",
      type: "video",
      position: { x: 400, y: 0 },
      data: { ...initialData("video"), prompt: "push in" },
    };
    useFlowStore.setState({
      nodes: [image, video],
      edges: [{ id: "e1", source: "image-1", target: "video-1", sourceHandle: "image-1:image", targetHandle: "video-1:image" }],
    });

    await runAll();

    const [a, b] = useFlowStore.getState().nodes;
    expect(a.data.status).toBe("error");
    expect(a.data.error).toBe("500 nope");
    expect(b.data.status).toBe("idle");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
