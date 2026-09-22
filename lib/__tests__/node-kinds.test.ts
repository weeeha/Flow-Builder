import { describe, expect, it } from "vitest";
import {
  NODE_KINDS,
  PALETTE_KINDS,
  inPalette,
  initialData,
  outputsOf,
  portTop,
  type PortSpec,
} from "../node-kinds";
import { VIDEO_MODELS } from "../models";
import type { ClusterNodeData, NodeKind } from "../types";

const KINDS: NodeKind[] = ["image", "video", "tts", "composition", "cluster"];

describe("NODE_KINDS", () => {
  it("covers every kind, in the order the toolbar shows them", () => {
    expect(Object.keys(NODE_KINDS)).toEqual(KINDS);
  });

  it("labels each kind the way its card header already does", () => {
    expect(KINDS.map((k) => NODE_KINDS[k].label)).toEqual([
      "Image",
      "Video",
      "Text to Speech",
      "Composition",
      "Concept Cluster",
    ]);
  });
});

describe("initialData", () => {
  // These are lib/store.ts's defaultData values before the registry existed.
  // A change here changes what every newly added node starts with.
  it.each([
    ["image", { status: "idle", prompt: "", model: "flux-dev" }],
    ["video", { status: "idle", prompt: "", model: "seedance-2.0", duration: 4 }],
    ["tts", { status: "idle", prompt: "", voice: "Rachel", model: "eleven_multilingual_v2" }],
    ["composition", { status: "idle" }],
    ["cluster", { status: "idle", prompt: "", groups: [], pinned: [], outputTexts: {} }],
  ] as const)("gives a %s node today's defaults", (kind, expected) => {
    expect(initialData(kind)).toEqual(expected);
  });

  it("hands out a fresh object each time, so two nodes never share one array", () => {
    const a = initialData("cluster");
    const b = initialData("cluster");
    expect(a).not.toBe(b);
    expect(a.groups).not.toBe(b.groups);
  });
});

describe("ports", () => {
  // These match the TypedHandle elements each card renders today. Handle ids are
  // built from them, so a change here detaches saved edges.
  it.each([
    ["image", [{ type: "text" }, { type: "image" }], [{ type: "image" }]],
    ["video", [{ type: "text" }, { type: "image" }], [{ type: "video" }]],
    ["tts", [{ type: "text" }], [{ type: "audio" }]],
    ["composition", [{ type: "video" }, { type: "audio" }], []],
    ["cluster", [{ type: "text", top: 24 }], []],
  ] as const)("declares %s's ports", (kind, inputs, outputs) => {
    expect(NODE_KINDS[kind].inputs).toEqual(inputs);
    expect(outputsOf(kind, initialData(kind))).toEqual(outputs);
  });

  it("gives a cluster one text output per pin, named by the pin id", () => {
    const data = {
      ...initialData("cluster"),
      pinned: [
        { id: "s-1", text: "a lighthouse at dusk", axis: "camera" },
        { id: "s-2", text: "an 1890s lighthouse", axis: "era" },
      ],
    } as ClusterNodeData;
    expect(outputsOf("cluster", data)).toEqual([
      { type: "text", port: "s-1", label: "a lighthouse at dusk" },
      { type: "text", port: "s-2", label: "an 1890s lighthouse" },
    ]);
  });
});

describe("portTop", () => {
  const one: PortSpec[] = [{ type: "text" }];
  const two: PortSpec[] = [{ type: "text" }, { type: "image" }];

  it("centres a lone port by leaving its offset unset", () => {
    expect(portTop(one, 0)).toBeUndefined();
  });

  it("stacks several ports 32 apart, starting at 24", () => {
    expect(portTop(two, 0)).toBe(24);
    expect(portTop(two, 1)).toBe(56);
  });

  it("lets a spec override the rule, as the cluster's lone input does", () => {
    expect(portTop([{ type: "text", top: 24 }], 0)).toBe(24);
  });
});

describe("fields", () => {
  it("keeps each card's prompt on the card", () => {
    for (const kind of ["image", "video", "tts", "cluster"] as const) {
      expect(NODE_KINDS[kind].fields.prompt?.placement).toBe("card");
    }
  });

  it("puts model, duration and voice in the inspector, per the hybrid split", () => {
    expect(NODE_KINDS.image.fields.model?.placement).toBe("inspector");
    expect(NODE_KINDS.video.fields.model?.placement).toBe("inspector");
    expect(NODE_KINDS.video.fields.duration?.placement).toBe("inspector");
    expect(NODE_KINDS.tts.fields.voice?.placement).toBe("inspector");
    expect(NODE_KINDS.tts.fields.model?.placement).toBe("inspector");
  });

  it("offers every model the type allows, including the two with no control today", () => {
    const values = (kind: "image" | "video" | "tts") => {
      const field = NODE_KINDS[kind].fields.model;
      return field?.control === "select" ? field.options.map((o) => o.value) : [];
    };
    expect(values("image")).toEqual(["flux-dev", "flux-schnell", "nano-banana"]);
    expect(values("video")).toEqual(VIDEO_MODELS.map((m) => m.id));
    expect(values("tts")).toEqual(["eleven_multilingual_v2", "eleven_turbo_v2_5"]);
  });

  it("gives composition and cluster nothing to configure yet", () => {
    expect(NODE_KINDS.composition.fields).toEqual({});
    expect(Object.keys(NODE_KINDS.cluster.fields)).toEqual(["prompt"]);
  });
});

describe("PALETTE_KINDS", () => {
  it("offers every kind today, in toolbar order", () => {
    expect(PALETTE_KINDS).toEqual(KINDS);
  });

  it("leaves out a kind that opts out, which is how the reference kind will stay off it", () => {
    expect(inPalette({ label: "Reference", palette: false })).toBe(false);
    expect(inPalette({ label: "Reference", palette: true })).toBe(true);
    expect(inPalette({ label: "Reference" })).toBe(true);
  });
});
