import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { markLostClips } from "../clip-upload";
import { initialData } from "../node-kinds";
import { createFlow, getFlow } from "../flows/repo";
import type { FlowNode } from "../types";

const reference = (clipUrl?: string): FlowNode => ({
  id: "reference-1",
  type: "reference",
  position: { x: 0, y: 0 },
  data: { ...initialData("reference"), status: "done", clipUrl, outputUrl: clipUrl, summary: "1 shot, dusk" },
});

describe("markLostClips", () => {
  it("clears a session-only clip and flags the card, keeping what was read from it", () => {
    const [node] = markLostClips([reference("blob:http://localhost/dusk")]);
    expect(node.data).toMatchObject({ clipMissing: true, clipUrl: undefined, outputUrl: undefined, summary: "1 shot, dusk" });
  });

  it("leaves a stored clip alone", () => {
    const stored = reference("https://store.public.blob.vercel-storage.com/clips/dusk-a1b2.mp4");
    expect(markLostClips([stored])).toEqual([stored]);
  });

  it("leaves other kinds alone, whatever their URLs", () => {
    const video = {
      id: "video-1",
      type: "video",
      position: { x: 0, y: 0 },
      data: { ...initialData("video"), outputUrl: "blob:http://localhost/x" },
    } as FlowNode;
    expect(markLostClips([video])).toEqual([video]);
  });
});

describe("a reload", () => {
  // A flow reopens from the repository, and every save runs markLostClips, so a
  // clip that never reached Blob storage comes back flagged instead of dead.
  it("flags a clip that never reached storage", async () => {
    const saved = await createFlow("Dusk", { nodes: [reference("blob:http://localhost/dusk")], edges: [] });
    const back = await getFlow(saved.id);
    expect(back!.nodes[0].data).toMatchObject({ clipMissing: true, clipUrl: undefined });
  });
});
