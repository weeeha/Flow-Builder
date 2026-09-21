import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignIds } from "../cluster";
import { rerollClusterGroup } from "../executor";
import { useFlowStore } from "../store";
import fixture from "../stubs/cluster.json";
import type { FlowNode } from "../types";

import { POST } from "@/app/api/generate/cluster/route";

// The executor's fetch lands on the real route handler, in stub mode (no key set).
const fetchSpy = vi.fn(async (url: string, init?: RequestInit) =>
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
