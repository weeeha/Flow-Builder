import { describe, expect, it } from "vitest";
import { fieldValue, inspectorFields, inspectorTarget } from "../inspector";
import { NODE_KINDS } from "../node-kinds";
import type { FlowNode } from "../types";

const node = (id: string, selected: boolean): FlowNode => ({
  id,
  type: "image",
  position: { x: 0, y: 0 },
  selected,
  data: { status: "idle", prompt: "", model: "flux-dev" },
});

describe("inspectorFields", () => {
  it.each([
    ["image", ["model"]],
    ["video", ["model", "duration"]],
    ["tts", ["voice", "model"]],
    ["composition", []],
    ["cluster", []],
  ] as const)("gives %s its inspector fields in table order", (kind, keys) => {
    expect(inspectorFields(kind).map((f) => f.key)).toEqual(keys);
  });

  it("leaves every card field on the card, prompts included", () => {
    for (const kind of ["image", "video", "tts", "cluster"] as const) {
      expect(inspectorFields(kind).map((f) => f.key)).not.toContain("prompt");
    }
  });

  it("carries each field's spec through, so the panel needs nothing else", () => {
    const [model] = inspectorFields("image");
    expect(model.spec).toBe(NODE_KINDS.image.fields.model);
  });
});

describe("fieldValue", () => {
  const duration = NODE_KINDS.video.fields.duration;
  const model = NODE_KINDS.image.fields.model;

  it("returns the option's own value, so a numeric field stays a number", () => {
    expect(fieldValue(duration, "6")).toBe(6);
    expect(typeof fieldValue(duration, "6")).toBe("number");
  });

  it("returns a string option unchanged", () => {
    expect(fieldValue(model, "nano-banana")).toBe("nano-banana");
  });

  it("returns undefined for a value the field does not offer", () => {
    expect(fieldValue(duration, "5")).toBeUndefined();
    expect(fieldValue(model, "sdxl")).toBeUndefined();
  });

  it("returns the raw string for a field that is not a select", () => {
    expect(fieldValue(NODE_KINDS.image.fields.prompt, "a lighthouse")).toBe("a lighthouse");
  });
});

describe("inspectorTarget", () => {
  it("shows the node when exactly one is selected", () => {
    const one = node("image-1", true);
    expect(inspectorTarget([one, node("image-2", false)], null)).toBe(one);
  });

  // Provisional until the [HAND] task below. Both cases close the panel today.
  it("shows nothing when the selection is empty", () => {
    expect(inspectorTarget([node("image-1", false)], null)).toBeNull();
  });

  it("shows nothing when several nodes are selected", () => {
    expect(inspectorTarget([node("image-1", true), node("image-2", true)], null)).toBeNull();
  });

  // [HAND] Nick's, per CONCEPT.md. What should the panel do with no selection,
  // with several selected, and right after a deselect: close like the reference,
  // or stay on the last node like Figma? `lastId` carries the last single
  // selection so either answer is reachable.
  it.todo("[HAND] keeps or drops the last node once the selection goes away");
});
