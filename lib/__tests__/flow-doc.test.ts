import { describe, expect, it } from "vitest";
import type { ClipBreakdown } from "../clip-schema";
import {
  COLUMN_GAP,
  NODE_HANDLES,
  ROW_GAP,
  breakdownToGraph,
  edgeIsValid,
  layoutGraph,
  validateGraph,
  type FlowDoc,
  type FlowDocEdge,
  type FlowDocNode,
} from "../flow-doc";
import { VIDEO_MODELS } from "../models";

const node = (id: string, kind: string, data: FlowDocNode["data"] = {}): FlowDocNode => ({ id, kind, data });
const edge = (source: string, sourceType: string, target: string, targetType: string): FlowDocEdge => ({
  source,
  sourceHandle: `${source}:${sourceType}`,
  target,
  targetHandle: `${target}:${targetType}`,
});
const doc = (nodes: FlowDocNode[], edges: FlowDocEdge[]): FlowDoc => ({ version: 1, nodes, edges });

const shot = (i: number, durationEstimateSeconds = 5): ClipBreakdown["shots"][number] => ({
  shotType: "wide",
  cameraAngle: "eye level",
  cameraMovement: "push-in",
  composition: "centred subject",
  subject: `subject ${i}`,
  action: "stands still",
  emotionalIntent: "calm",
  imagePrompt: `image prompt ${i}`,
  videoPrompt: `video prompt ${i}`,
  durationEstimateSeconds,
  tStart: i,
  tEnd: i + 1,
});
const breakdown = (shots: number): ClipBreakdown => ({
  summary: "1 shot, push-in, dusk",
  shots: Array.from({ length: shots }, (_, i) => shot(i + 1)),
});

/** image → video → composition, the smallest graph the template makes. */
const chain = () =>
  doc(
    [node("image-1", "image"), node("video-1", "video"), node("composition-1", "composition")],
    [edge("image-1", "image", "video-1", "image"), edge("video-1", "video", "composition-1", "video")]
  );

describe("NODE_HANDLES", () => {
  it("matches the spec's hand-written table, derived from NODE_KINDS", () => {
    expect(NODE_HANDLES).toEqual({
      image: { in: ["text", "image"], out: ["image"] },
      video: { in: ["text", "image"], out: ["video"] },
      tts: { in: ["text"], out: ["audio"] },
      composition: { in: ["video", "audio"], out: [] },
    });
  });
});

describe("layoutGraph", () => {
  it("puts each step of a chain one column further right, from the origin", () => {
    const at = layoutGraph(chain(), { x: 100, y: 50 });
    expect(at["image-1"]).toEqual({ x: 100, y: 50 });
    expect(at["video-1"]).toEqual({ x: 100 + COLUMN_GAP, y: 50 });
    expect(at["composition-1"]).toEqual({ x: 100 + 2 * COLUMN_GAP, y: 50 });
  });

  it("stacks nodes of one depth in a column and puts a join after its deepest input", () => {
    const g = breakdownToGraph(breakdown(2), true);
    const at = layoutGraph(g, { x: 0, y: 0 });
    // Depth 0: both images and the tts; depth 1: both videos; depth 2: composition.
    expect(at["image-1"]).toEqual({ x: 0, y: 0 });
    expect(at["image-2"]).toEqual({ x: 0, y: ROW_GAP });
    expect(at["tts-1"]).toEqual({ x: 0, y: 2 * ROW_GAP });
    expect(at["video-2"]).toEqual({ x: COLUMN_GAP, y: ROW_GAP });
    expect(at["composition-1"]).toEqual({ x: 2 * COLUMN_GAP, y: 0 });
  });

  it("places every node even when the edges form a cycle", () => {
    const g = doc([node("a", "image"), node("b", "video")], [edge("a", "image", "b", "image"), edge("b", "video", "a", "image")]);
    const at = layoutGraph(g, { x: 0, y: 0 });
    expect(Object.keys(at).sort()).toEqual(["a", "b"]);
  });
});

describe("breakdownToGraph", () => {
  it("builds image into video into composition for one shot without audio", () => {
    const g = breakdownToGraph(breakdown(1), false);
    expect(g.nodes.map((n) => n.id)).toEqual(["image-1", "video-1", "composition-1"]);
    expect(g.nodes[0].data).toEqual({ prompt: "image prompt 1" });
    expect(g.nodes[1].data).toEqual({ prompt: "video prompt 1", model: VIDEO_MODELS[0].id, duration: 4 });
    expect(g.edges).toEqual(chain().edges);
    expect(validateGraph(g)).toEqual([]);
  });

  it.each([true, "unknown"] as const)("adds a tts into composition's audio when audio is %s", (hasAudio) => {
    const g = breakdownToGraph(breakdown(1), hasAudio);
    expect(g.nodes.find((n) => n.id === "tts-1")?.data).toEqual({ prompt: "1 shot, push-in, dusk" });
    expect(g.edges).toContainEqual(edge("tts-1", "audio", "composition-1", "audio"));
    expect(validateGraph(g)).toEqual([]);
  });

  it("makes an image and a video per shot, and wires only the first video into the composition", () => {
    const g = breakdownToGraph(breakdown(3), false);
    expect(g.nodes.filter((n) => n.kind === "video")).toHaveLength(3);
    expect(g.edges.filter((e) => e.target === "composition-1")).toEqual([
      edge("video-1", "video", "composition-1", "video"),
    ]);
    expect(validateGraph(g)).toEqual([]);
  });

  it("snaps a shot's estimate to the nearest duration the video node offers", () => {
    const g = breakdownToGraph({ summary: "s", shots: [shot(1, 7.4)] }, false);
    expect(g.nodes.find((n) => n.kind === "video")?.data.duration).toBe(8);
  });
});

describe("validateGraph", () => {
  const messages = (g: FlowDoc) => validateGraph(g).map((e) => e.message);

  it("accepts a clean chain", () => {
    expect(validateGraph(chain())).toEqual([]);
  });

  it("rejects a kind outside the four a model may use, the app's own kinds included", () => {
    for (const kind of ["agent", "cluster", "reference"]) {
      const g = chain();
      g.nodes.push(node("x-1", kind));
      expect(messages(g)).toContain(`Node x-1 has kind "${kind}"; use only image, video, tts or composition.`);
    }
  });

  it("rejects a duplicate id", () => {
    const g = chain();
    g.nodes.push(node("video-1", "video"));
    expect(messages(g)).toContain('Two nodes share the id "video-1".');
  });

  it("rejects an edge to a node that does not exist", () => {
    const g = chain();
    g.edges.push(edge("image-1", "image", "video-9", "image"));
    expect(messages(g)).toContain("An edge from image-1 goes to video-9, which is not in the graph.");
  });

  it("rejects an edge out of composition, which has no outputs", () => {
    const g = chain();
    g.nodes.push(node("video-2", "video"));
    g.edges.push(edge("composition-1", "video", "video-2", "image"));
    expect(messages(g)).toContain("composition-1 is a composition and has no outputs.");
  });

  it("rejects two edges into one non-text input and allows several into a text input", () => {
    const g = chain();
    g.nodes.push(node("video-2", "video"), node("tts-1", "tts"), node("tts-2", "tts"));
    g.edges.push(edge("video-2", "video", "composition-1", "video"));
    expect(messages(g)).toContain("composition-1's video input has 2 edges; it takes one.");

    const text = doc([node("t-1", "tts"), node("t-2", "tts"), node("i-1", "image")], []);
    // tts has no text output, so this exercises only the count rule; edgeIsValid owns types.
    text.edges.push(
      { source: "t-1", sourceHandle: "t-1:text", target: "i-1", targetHandle: "i-1:text" },
      { source: "t-2", sourceHandle: "t-2:text", target: "i-1", targetHandle: "i-1:text" }
    );
    expect(messages(text).some((m) => m.includes("text input"))).toBe(false);
  });

  it("rejects a handle mismatch", () => {
    const g = chain();
    g.nodes.push(node("tts-1", "tts"));
    g.edges.push({ source: "tts-1", sourceHandle: "tts-1:audio", target: "video-1", targetHandle: "video-1:text" });
    expect(messages(g)).toContain("The edge tts-1:audio → video-1:text joins handles that do not fit.");
  });

  it("rejects a cycle", () => {
    const g = doc([node("a", "video"), node("b", "video")], [edge("a", "video", "b", "image"), edge("b", "video", "a", "image")]);
    expect(messages(g)).toContain("The edges form a cycle through a, b.");
  });
});

// Plan task 3. Nick's rule, 2026-09-23: a named port on a kind without named ports is invalid (1A).
describe("edgeIsValid", () => {
  const graph = [
    node("image-1", "image"),
    node("video-1", "video"),
    node("tts-1", "tts"),
    node("composition-1", "composition"),
  ];

  it("accepts image's image output into video's image input", () => {
    expect(edgeIsValid(edge("image-1", "image", "video-1", "image"), graph)).toBe(true);
  });

  it("accepts video's video output into composition's video input", () => {
    expect(edgeIsValid(edge("video-1", "video", "composition-1", "video"), graph)).toBe(true);
  });

  it("rejects tts's audio output into video's text input, a type mismatch", () => {
    expect(
      edgeIsValid({ source: "tts-1", sourceHandle: "tts-1:audio", target: "video-1", targetHandle: "video-1:text" }, graph)
    ).toBe(false);
  });

  it("rejects an edge to a missing target node", () => {
    expect(edgeIsValid(edge("image-1", "image", "video-9", "image"), graph)).toBe(false);
  });

  it("rejects composition as a source, since it has no outputs", () => {
    expect(edgeIsValid(edge("composition-1", "video", "video-1", "image"), graph)).toBe(false);
  });

  it('rejects "video-1:image:0", a named port on a kind with no named ports', () => {
    expect(
      edgeIsValid({ source: "image-1", sourceHandle: "image-1:image", target: "video-1", targetHandle: "video-1:image:0" }, graph)
    ).toBe(false);
  });

  it("rejects a handle id that names a different node than the edge's own end", () => {
    expect(
      edgeIsValid({ source: "image-1", sourceHandle: "image-1:image", target: "video-1", targetHandle: "tts-1:text" }, graph)
    ).toBe(false);
  });

  it("rejects an input a kind does not have, even when the types match", () => {
    expect(edgeIsValid(edge("video-1", "video", "image-1", "video"), graph)).toBe(false);
  });
});
