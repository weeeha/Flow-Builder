import { describe, expect, it } from "vitest";
import { initialData } from "../node-kinds";
import { previewOf } from "../flows/preview";
import type { FlowNode } from "../types";

const node = (id: string, type: FlowNode["type"], x: number, data = {}) =>
  ({ id, type, position: { x, y: 0 }, data: { ...initialData(type), ...data } }) as FlowNode;

describe("previewOf", () => {
  it("keeps kinds, positions and edges as node indexes", () => {
    const p = previewOf([node("a", "image", 0), node("b", "video", 400)], [{ id: "e", source: "a", target: "b" }]);
    expect(p).toEqual({ nodes: [{ kind: "image", x: 0, y: 0 }, { kind: "video", x: 400, y: 0 }], edges: [[0, 1]] });
  });

  it("takes the first http image output as the thumbnail and never a data URL", () => {
    expect(previewOf([node("a", "image", 0, { outputUrl: "data:image/png;base64,AA" }), node("b", "image", 1, { outputUrl: "https://x.test/b.png" })], []).image)
      .toBe("https://x.test/b.png");
    expect(previewOf([node("a", "image", 0, { outputUrl: "data:image/png;base64,AA" })], []).image).toBeUndefined();
  });
});
