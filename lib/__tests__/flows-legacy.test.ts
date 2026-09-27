import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clear } from "idb-keyval";
import { initialData } from "../node-kinds";
import { LEGACY_FLAG, LEGACY_KEY, importLegacyFlow } from "../flows/legacy";
import { createFlow, getFlow, kv, listFlows } from "../flows/repo";

const legacy = (nodes: unknown[]) => JSON.stringify({ state: { nodes, edges: [] }, version: 0 });
const image = { id: "image-a", type: "image", position: { x: 0, y: 0 }, data: { ...initialData("image"), prompt: "kept" } };

beforeEach(async () => {
  await clear(kv);
  localStorage.clear();
});

describe("importLegacyFlow", () => {
  it("carries the saved flow over once as Untitled flow and keeps the old key as a backup", async () => {
    localStorage.setItem(LEGACY_KEY, legacy([image]));
    const id = await importLegacyFlow();
    expect((await getFlow(id!))!.nodes[0].data.prompt).toBe("kept");
    expect((await listFlows()).map((s) => s.name)).toEqual(["Untitled flow"]);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_FLAG)).toBe("1");
    expect(await importLegacyFlow()).toBeNull();
    expect(await listFlows()).toHaveLength(1);
  });

  it("creates nothing from an empty legacy state", async () => {
    localStorage.setItem(LEGACY_KEY, legacy([]));
    expect(await importLegacyFlow()).toBeNull();
    expect(await listFlows()).toEqual([]);
  });

  it("leaves a browser that already has flows alone", async () => {
    await createFlow("Mine");
    localStorage.setItem(LEGACY_KEY, legacy([image]));
    expect(await importLegacyFlow()).toBeNull();
  });

  it("skips unreadable legacy data instead of failing the page", async () => {
    localStorage.setItem(LEGACY_KEY, "{broken");
    expect(await importLegacyFlow()).toBeNull();
  });
});
