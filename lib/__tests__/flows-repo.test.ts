import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clear } from "idb-keyval";
import { initialData } from "../node-kinds";
import { FlowConflictError, createFlow, deleteFlow, duplicateFlow, getFlow, listFlows, renameFlow, saveFlow } from "../flows/repo";
import { kv } from "../flows/repo";
import type { FlowNode } from "../types";

const image = { id: "image-1", type: "image", position: { x: 0, y: 0 }, data: { ...initialData("image"), status: "running" } } as FlowNode;

beforeEach(async () => {
  await clear(kv);
});

describe("the flow repository", () => {
  it("creates, lists newest first, and reads back a flow with run state reset", async () => {
    const a = await createFlow("A", { nodes: [image], edges: [] });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createFlow("B");
    expect((await listFlows()).map((s) => s.name)).toEqual(["B", "A"]);
    expect((await getFlow(a.id))!.nodes[0].data.status).toBe("idle");
    expect((await listFlows()).find((s) => s.id === a.id)).toMatchObject({ nodeCount: 1, preview: { nodes: [{ kind: "image" }] } });
    expect(b.name).toBe("B");
  });

  it("names a new flow Untitled flow by default", async () => {
    expect((await createFlow()).name).toBe("Untitled flow");
  });

  it("renames, duplicates as '<name> copy', and deletes, keeping the index in step", async () => {
    const a = await createFlow("Lighthouse", { nodes: [image], edges: [] });
    await renameFlow(a.id, "Lighthouse at dusk");
    const copy = await duplicateFlow(a.id);
    expect(copy.name).toBe("Lighthouse at dusk copy");
    expect(copy.id).not.toBe(a.id);
    expect(copy.nodes).toEqual((await getFlow(a.id))!.nodes);
    await deleteFlow(a.id);
    expect(await getFlow(a.id)).toBeUndefined();
    expect((await listFlows()).map((s) => s.name)).toEqual(["Lighthouse at dusk copy"]);
  });

  it("stamps updatedAt on save and refuses a write from a tab that fell behind", async () => {
    const a = await createFlow("A");
    const saved = await saveFlow({ ...a, name: "A2" }, { expectedUpdatedAt: a.updatedAt });
    expect(saved.updatedAt > a.updatedAt).toBe(true);
    await expect(saveFlow({ ...a, name: "stale" }, { expectedUpdatedAt: a.updatedAt })).rejects.toThrow(FlowConflictError);
    expect((await getFlow(a.id))!.name).toBe("A2");
  });
});
