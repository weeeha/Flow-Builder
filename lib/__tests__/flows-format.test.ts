import { describe, expect, it } from "vitest";
import { initialData } from "../node-kinds";
import { CURRENT_VERSION, FlowFormatError, migrate, newFlowFile, parseImport, toExportText, toSavedNodes } from "../flows/format";
import type { FlowNode } from "../types";

const image = (over: Partial<FlowNode> = {}): FlowNode =>
  ({ id: "image-1", type: "image", position: { x: 10, y: 20 }, data: { ...initialData("image"), prompt: "a lighthouse" }, ...over }) as FlowNode;

describe("toSavedNodes", () => {
  it("keeps id, type, position and data, drops React Flow's runtime fields, and resets run state", () => {
    const live = { ...image(), selected: true, dragging: false, measured: { width: 320, height: 300 },
      data: { ...image().data, status: "error", error: "boom", outputUrl: "https://x.test/a.png" } } as FlowNode;
    expect(toSavedNodes([live])).toEqual([{ id: "image-1", type: "image", position: { x: 10, y: 20 },
      data: { ...image().data, status: "idle", outputUrl: "https://x.test/a.png" } }]);
  });

  it("drops a session-only clip and marks the card missing", () => {
    const ref = { id: "reference-1", type: "reference", position: { x: 0, y: 0 },
      data: { ...initialData("reference"), clipUrl: "blob:http://localhost/x", outputUrl: "blob:http://localhost/x" } } as FlowNode;
    expect(toSavedNodes([ref])[0].data).toMatchObject({ clipUrl: undefined, outputUrl: undefined, clipMissing: true });
  });
});

describe("migrate", () => {
  it("lifts the legacy localStorage shape (version 0) into a v1 flow named Untitled flow", () => {
    const file = migrate({ state: { nodes: [image()], edges: [] }, version: 0 });
    expect(file).toMatchObject({ format: "flow-builder", version: CURRENT_VERSION, name: "Untitled flow", edges: [] });
    expect(file.nodes[0].data.prompt).toBe("a lighthouse");
    expect(file.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("passes a current file through unchanged", () => {
    const file = newFlowFile("Mine", [image()]);
    expect(migrate(file)).toEqual(file);
  });

  it("refuses a file from a newer Flow Builder", () => {
    expect(() => migrate({ ...newFlowFile("x"), version: CURRENT_VERSION + 1 })).toThrow("This flow was saved by a newer Flow Builder");
  });
});

describe("parseImport", () => {
  it("round-trips an export with a new id and the same name, nodes and edges", () => {
    const file = newFlowFile("Lighthouse", [image(), { ...image(), id: "video-1", type: "video", data: initialData("video") } as FlowNode],
      [{ id: "e1", source: "image-1", target: "video-1", sourceHandle: "image-1:image", targetHandle: "video-1:image" }]);
    const back = parseImport(toExportText(file));
    expect(back.id).not.toBe(file.id);
    expect(back.name).toBe("Lighthouse");
    expect(back.nodes).toEqual(file.nodes);
    expect(back.edges).toEqual(file.edges);
  });

  it("fills keys a kind gained since the file was written", () => {
    const old = newFlowFile("Old", [{ id: "video-1", type: "video", position: { x: 0, y: 0 }, data: { status: "idle", prompt: "p" } } as FlowNode]);
    expect(parseImport(JSON.stringify(old)).nodes[0].data).toMatchObject({ prompt: "p", model: initialData("video").model, duration: 4 });
  });

  it.each([
    ["not JSON", "{nope", "This file isn't valid JSON"],
    ["an unknown kind", JSON.stringify(newFlowFile("x", [{ ...image(), type: "agent" } as unknown as FlowNode])), 'Unknown node kind "agent"'],
    ["a dangling edge", JSON.stringify(newFlowFile("x", [image()], [{ id: "e", source: "image-1", target: "gone", sourceHandle: "image-1:image", targetHandle: "gone:image" }])), 'An edge points at "gone", which isn\'t in the flow'],
    ["another app's JSON", JSON.stringify({ hello: 1 }), "This isn't a Flow Builder file"],
  ])("rejects %s with a reason", (_label, text, reason) => {
    expect(() => parseImport(text)).toThrow(FlowFormatError);
    expect(() => parseImport(text)).toThrow(reason);
  });
});
