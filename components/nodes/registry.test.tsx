import { describe, expect, it } from "vitest";
import { NODE_KIND_LIST } from "@/lib/node-kinds";
import { NODE_VIEWS, nodeTypes } from "./registry";

describe("NODE_VIEWS", () => {
  it("gives every kind in the table an icon and a card", () => {
    for (const kind of NODE_KIND_LIST) {
      expect(NODE_VIEWS[kind].icon).toBeTruthy();
      expect(NODE_VIEWS[kind].Card).toBeTruthy();
    }
  });

  it("registers exactly the table's kinds with React Flow, each under its own card", () => {
    expect(Object.keys(nodeTypes).sort()).toEqual([...NODE_KIND_LIST].sort());
    for (const kind of NODE_KIND_LIST) expect(nodeTypes[kind]).toBe(NODE_VIEWS[kind].Card);
  });
});
