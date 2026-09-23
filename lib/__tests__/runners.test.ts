import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignIds } from "../cluster";
import { NODE_KIND_LIST, initialData } from "../node-kinds";
import { RUNNERS } from "../runners";
import fixture from "../stubs/cluster.json";
import type { ClusterNodeData, NodeInputs } from "../types";

import { POST as clusterPOST } from "@/app/api/generate/cluster/route";

const noInputs = (): NodeInputs => ({ texts: [], images: [], videos: [], audios: [] });

// A generation route that answers with a fixed url, recording what it was sent.
const urlRoute = vi.fn(async (_url: string, _init?: RequestInit) =>
  Response.json({ url: "https://example.test/out" })
);

const sentBody = () => JSON.parse(urlRoute.mock.calls[0][1]!.body as string);

beforeEach(() => {
  urlRoute.mockClear();
  vi.stubGlobal("fetch", urlRoute);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RUNNERS", () => {
  it("has a runner for every kind in the table", () => {
    for (const kind of NODE_KIND_LIST) expect(typeof RUNNERS[kind]).toBe("function");
  });

  it.each([
    ["image", "/api/generate/image"],
    ["video", "/api/generate/video"],
    ["tts", "/api/generate/speech"],
  ] as const)("%s posts to %s with wired text folded into the prompt", async (kind, endpoint) => {
    const data = { ...initialData(kind), prompt: "own" };
    const inputs = { ...noInputs(), texts: ["wired"], images: ["https://example.test/in.png"] };

    const patch = await RUNNERS[kind]({ data: data as never, inputs });

    expect(urlRoute).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: "POST" }));
    expect(sentBody().data.prompt).toBe("own wired");
    expect(sentBody().data.model).toBe(data.model);
    expect(sentBody().inputs).toEqual({ ...inputs, texts: [] });
    // A url result still writes videoUrl beside outputUrl, as the executor always has.
    expect(patch).toEqual({ outputUrl: "https://example.test/out", videoUrl: "https://example.test/out" });
  });

  it("throws the status and body when a generation route fails", async () => {
    urlRoute.mockResolvedValueOnce(new Response("fal is down", { status: 502 }));
    await expect(
      RUNNERS.image({ data: { ...initialData("image"), prompt: "x" }, inputs: noInputs() })
    ).rejects.toThrow("502 fal is down");
  });

  it("composition passes its first wired video through without a request", async () => {
    const inputs = { ...noInputs(), videos: ["https://example.test/a.mp4", "https://example.test/b.mp4"] };
    const patch = await RUNNERS.composition({ data: initialData("composition"), inputs });
    expect(patch).toEqual({ outputUrl: "https://example.test/a.mp4", videoUrl: "https://example.test/a.mp4" });
    expect(urlRoute).not.toHaveBeenCalled();

    const empty = await RUNNERS.composition({ data: initialData("composition"), inputs: noInputs() });
    expect(empty).toEqual({ outputUrl: "", videoUrl: "" });
  });

  describe("cluster", () => {
    const groups = assignIds(fixture.sets[0].groups);
    const pin = { ...groups[1].suggestions[0], axis: groups[1].axis };
    const data: ClusterNodeData = {
      ...initialData("cluster"),
      prompt: "a lighthouse at dusk",
      groups,
      pinned: [pin],
      outputTexts: { [pin.id]: pin.text },
    };

    beforeEach(() => {
      vi.stubGlobal("fetch", async (url: string, init?: RequestInit) =>
        clusterPOST(new Request(`http://localhost${url}`, init))
      );
    });

    it("reports an empty prompt instead of rolling", async () => {
      await expect(
        RUNNERS.cluster({ data: { ...data, prompt: "" }, inputs: noInputs() })
      ).rejects.toThrow("Prompt is empty");
    });

    it("returns a patch that merges into the node as it is when the roll lands, so pins win", async () => {
      const patch = await RUNNERS.cluster({ data, inputs: noInputs() });
      expect(typeof patch).toBe("function");

      // A second chip was pinned while the roll was in flight.
      const late = { ...groups[2].suggestions[0], axis: groups[2].axis };
      const fresh = { ...data, pinned: [pin, late] };
      const applied = (patch as (fresh: ClusterNodeData) => Partial<ClusterNodeData>)(fresh);

      expect(applied.stub).toBe(true);
      expect(applied.outputTexts).toEqual({ [pin.id]: pin.text, [late.id]: late.text });
      const kept = applied.groups!.flatMap((g) => g.suggestions.map((s) => s.id));
      expect(kept).toContain(pin.id);
      expect(kept).toContain(late.id);
    });
  });
});
