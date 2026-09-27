# Flow documents: build plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Many named flows stored in IndexedDB, a home page at `/`, the canvas at `/flows/[id]`, `.flow.json` export and import with versioned migrations, undo and redo that keeps run results, visible autosave, and four templates.

**Architecture:** `lib/flows/` holds the pure document layer (format, repository, preview, legacy import, templates, history, autosave). `lib/store.ts` stays the single live copy of the open flow, so the executor, runners and clip drop are untouched; it drops its localStorage `persist` wrapper and gains `flowId`, `name` and `openFlow`. Routes: `/` home, `/templates`, `/flows/new` (creates and redirects), `/flows/[id]` canvas.

**Tech Stack:** Next 16 app router (client pages), React 19, zustand 5, zod 4, `idb-keyval` 6.3.0, Vitest + jsdom + `fake-indexeddb` 6.2.5, Chrome (CDP) and Safari (safaridriver) check scripts.

**Spec:** `docs/builds/flow-documents/spec.md` (approved 2026-09-26 with defaults: keep sidebar collapse, confirm dialog on delete, keep `/templates`). Visual source: `docs/builds/flow-documents/draft.html`.

## Global Constraints
- Base: `main` 8664e70. Branch `flow-documents`. Never push to `main`.
- Only the project's tokens and `components/ui` primitives (Button, Input, Dialog, DropdownMenu, Skeleton); icons from `lucide-react`; radii 8px (controls) and 16px (cards); no new fonts or sizes beyond 12, 13, 14, 15, 24px. Run `me:unslop` before building UI (tasks 7 to 9) and again before calling each done.
- Copy: verb + object labels, no exclamation marks, no em dashes.
- `data.status` is always saved as `"idle"` and `data.error` is never saved.
- A session-only clip URL (`blob:`) is never saved or exported; `markLostClips` handles it.
- Import never overwrites a flow: it always gets a new id.
- Run results survive undo (spec section "Undo and redo").
- IndexedDB layout: one database `flow-builder`, one object store `kv`, keys `flow:<id>` (a `FlowFile`) and `index` (a `Record<string, FlowSummary>`), written together in one transaction. This corrects the spec's "two stores": `idb-keyval` opens one store per database.
- `pnpm test` and `pnpm typecheck` green after every task (typecheck with no dev server in the same worktree, or `rm -rf .next/dev/types` first).

## File map
| File | Responsibility |
|---|---|
| `lib/flows/format.ts` | `FlowFile`, `FlowSummary` types; zod schemas; `CURRENT_VERSION`; `migrate`; `toSavedNodes`; `parseImport`; `toExportText` |
| `lib/flows/preview.ts` | `previewOf(nodes, edges)` for cards |
| `lib/flows/repo.ts` | IndexedDB repository |
| `lib/flows/legacy.ts` | one-time carry-over of `flow-builder-state` |
| `lib/flows/templates.ts` | four templates as `FlowFile` factories |
| `lib/flows/history.ts` | undo and redo over the store |
| `lib/flows/autosave.ts` | debounced save, save state, other-tab guard |
| `lib/flows/debug-hook.ts` | `window.__flowBuilder` for the check scripts |
| `app/flows/[id]/page.tsx`, `app/flows/new/page.tsx` | canvas route, create-and-redirect route |
| `components/flow-header.tsx` | back, name, save state, undo, redo, export |
| `components/home/*` | shell, flow grid, card, templates row, import button, delete dialog |
| `app/page.tsx`, `app/templates/page.tsx` | home, templates page |
| `scripts/lib/flow-session.mjs` | shared reset, seed and open helpers for check scripts |
| `scripts/check-flows-chrome.mjs` | this build's browser check |

---

### Task 1: File format and migrations (30 min)

**Files:** Create `lib/flows/format.ts`, `lib/__tests__/flows-format.test.ts`.

**Interfaces:**
- Consumes: `FlowNode`, `FlowEdge` (`lib/types.ts`), `NODE_KIND_LIST`, `initialData` (`lib/node-kinds.ts`), `markLostClips` (`lib/clip-upload.ts`).
- Produces:
  ```ts
  export const CURRENT_VERSION = 1;
  export interface FlowFile { format: "flow-builder"; version: 1; id: string; name: string; createdAt: string; updatedAt: string; nodes: FlowNode[]; edges: FlowEdge[] }
  export interface FlowSummary { id: string; name: string; createdAt: string; updatedAt: string; nodeCount: number; preview: FlowPreview }
  export function toSavedNodes(nodes: FlowNode[]): FlowNode[];
  export function toSavedEdges(edges: FlowEdge[]): FlowEdge[];
  export function migrate(raw: unknown): FlowFile;          // throws FlowFormatError
  export function parseImport(text: string): FlowFile;      // new id, throws FlowFormatError
  export function toExportText(file: FlowFile): string;
  export class FlowFormatError extends Error {}
  export function newFlowFile(name: string, nodes?: FlowNode[], edges?: FlowEdge[]): FlowFile;
  ```
  (`FlowPreview` is defined in Task 2; declare `FlowSummary` there instead if you build Task 1 alone.)

- [ ] **Step 1: Write the failing tests**
```ts
// lib/__tests__/flows-format.test.ts
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
```

- [ ] **Step 2: Run to see it fail.** `pnpm vitest run lib/__tests__/flows-format.test.ts` → FAIL, cannot resolve `../flows/format`.

- [ ] **Step 3: Implement**
```ts
// lib/flows/format.ts
import { z } from "zod";
import { markLostClips } from "../clip-upload";
import { NODE_KIND_LIST, initialData } from "../node-kinds";
import type { FlowEdge, FlowNode, NodeKind } from "../types";
import type { FlowPreview } from "./preview";

/**
 * A flow as a document: what is stored in IndexedDB and what a .flow.json holds.
 * Every file carries `version`; `migrate` lifts older ones, so a saved flow keeps
 * opening after the format changes.
 */
export const CURRENT_VERSION = 1;

export interface FlowFile {
  format: "flow-builder";
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** What the home page reads: enough for a card, never the full flow. */
export interface FlowSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  preview: FlowPreview;
}

export class FlowFormatError extends Error {}

const now = () => new Date().toISOString();

export function newFlowFile(name: string, nodes: FlowNode[] = [], edges: FlowEdge[] = []): FlowFile {
  const at = now();
  return { format: "flow-builder", version: CURRENT_VERSION, id: crypto.randomUUID(), name, createdAt: at, updatedAt: at, nodes, edges };
}

/** Position and data only, run state reset, dead clip URLs dropped. */
export function toSavedNodes(nodes: FlowNode[]): FlowNode[] {
  return markLostClips(nodes).map((node) => {
    const { error: _error, ...data } = node.data as Record<string, unknown>;
    void _error;
    return { id: node.id, type: node.type, position: node.position, data: { ...data, status: "idle" } } as FlowNode;
  });
}

export function toSavedEdges(edges: FlowEdge[]): FlowEdge[] {
  return edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle }));
}

const NodeSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()),
});
const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});
const FileSchema = z.object({
  format: z.literal("flow-builder"),
  version: z.number().int(),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
});
const LegacySchema = z.object({
  state: z.object({ nodes: z.array(NodeSchema), edges: z.array(EdgeSchema) }),
  version: z.literal(0).optional(),
});

/** Lift any known shape to the current version. Checks kinds and edge ends. */
export function migrate(raw: unknown): FlowFile {
  const legacy = LegacySchema.safeParse(raw);
  if (legacy.success) {
    return check(newFlowFile("Untitled flow", legacy.data.state.nodes as FlowNode[], legacy.data.state.edges as FlowEdge[]));
  }
  const parsed = FileSchema.safeParse(raw);
  if (!parsed.success) throw new FlowFormatError("This isn't a Flow Builder file");
  if (parsed.data.version > CURRENT_VERSION) throw new FlowFormatError("This flow was saved by a newer Flow Builder");
  // Version 1 is the first file version; later versions add steps here, in order.
  return check(parsed.data as unknown as FlowFile);
}

function check(file: FlowFile): FlowFile {
  const ids = new Set(file.nodes.map((n) => n.id));
  for (const node of file.nodes) {
    if (!NODE_KIND_LIST.includes(node.type as NodeKind)) throw new FlowFormatError(`Unknown node kind "${node.type}"`);
  }
  for (const edge of file.edges) {
    for (const end of [edge.source, edge.target]) {
      if (!ids.has(end)) throw new FlowFormatError(`An edge points at "${end}", which isn't in the flow`);
    }
  }
  const nodes = file.nodes.map((node) => ({ ...node, data: { ...initialData(node.type), ...node.data } }) as FlowNode);
  return { ...file, nodes };
}

export function parseImport(text: string): FlowFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FlowFormatError("This file isn't valid JSON");
  }
  const file = migrate(raw);
  const at = now();
  return { ...file, id: crypto.randomUUID(), createdAt: at, updatedAt: at, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges) };
}

export function toExportText(file: FlowFile): string {
  return JSON.stringify({ ...file, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges) }, null, 2);
}
```
Create `lib/flows/preview.ts` with only `export interface FlowPreview { nodes: { kind: string; x: number; y: number }[]; edges: [number, number][]; image?: string }` so this compiles; Task 2 fills in `previewOf`.

- [ ] **Step 4: Run.** `pnpm vitest run lib/__tests__/flows-format.test.ts` → PASS. `pnpm typecheck` clean.
- [ ] **Step 5: Commit.** `git add lib/flows lib/__tests__/flows-format.test.ts && git commit -m "flows: file format, migrations and import validation"`

---

### Task 2: Preview and IndexedDB repository (45 min)

**Files:** Modify `lib/flows/preview.ts`; create `lib/flows/repo.ts`, `lib/__tests__/flows-repo.test.ts`, `lib/__tests__/flows-preview.test.ts`. Add dependencies.

**Interfaces:**
- Consumes: Task 1's `FlowFile`, `FlowSummary`, `newFlowFile`, `toSavedNodes`, `toSavedEdges`.
- Produces:
  ```ts
  export function previewOf(nodes: FlowNode[], edges: FlowEdge[]): FlowPreview;
  export class FlowConflictError extends Error {}           // repo.ts
  export async function listFlows(): Promise<FlowSummary[]>; // newest updatedAt first
  export async function getFlow(id: string): Promise<FlowFile | undefined>;
  export async function saveFlow(file: FlowFile, opts?: { expectedUpdatedAt?: string }): Promise<FlowFile>; // stamps updatedAt, returns saved
  export async function createFlow(name?: string, seed?: Pick<FlowFile, "nodes" | "edges">): Promise<FlowFile>;
  export async function duplicateFlow(id: string): Promise<FlowFile>; // "<name> copy"
  export async function renameFlow(id: string, name: string): Promise<FlowFile>;
  export async function deleteFlow(id: string): Promise<void>;
  export async function storageAvailable(): Promise<boolean>;
  ```

- [ ] **Step 1: Dependencies.** `pnpm add idb-keyval@6.3.0 && pnpm add -D fake-indexeddb@6.2.5`

- [ ] **Step 2: Write the failing tests**
```ts
// lib/__tests__/flows-preview.test.ts
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
```
```ts
// lib/__tests__/flows-repo.test.ts
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
```

- [ ] **Step 3: Run to see them fail.** `pnpm vitest run lib/__tests__/flows-preview.test.ts lib/__tests__/flows-repo.test.ts` → FAIL, missing exports.

- [ ] **Step 4: Implement**
```ts
// lib/flows/preview.ts
import type { FlowEdge, FlowNode } from "../types";

/** What a flow card draws: the graph as kinds and positions, or its first image. */
export interface FlowPreview {
  nodes: { kind: string; x: number; y: number }[];
  edges: [number, number][];
  image?: string;
}

const isHttp = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//.test(url);

export function previewOf(nodes: FlowNode[], edges: FlowEdge[]): FlowPreview {
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const image = nodes.find((n) => n.type === "image" && isHttp(n.data.outputUrl))?.data.outputUrl as string | undefined;
  return {
    nodes: nodes.map((n) => ({ kind: n.type, x: n.position.x, y: n.position.y })),
    edges: edges.flatMap((e) => (index.has(e.source) && index.has(e.target) ? [[index.get(e.source)!, index.get(e.target)!] as [number, number]] : [])),
    ...(image ? { image } : {}),
  };
}
```
```ts
// lib/flows/repo.ts
import { createStore, get, promisifyRequest } from "idb-keyval";
import type { FlowEdge, FlowNode } from "../types";
import { newFlowFile, toSavedEdges, toSavedNodes, type FlowFile, type FlowSummary } from "./format";
import { previewOf } from "./preview";

/**
 * Flows live in IndexedDB: one database, one store, keys `flow:<id>` for each
 * flow and `index` for the summaries the home page reads. A save writes both in
 * one transaction, so the list never disagrees with the flows.
 */
export const kv = createStore("flow-builder", "kv");
const INDEX = "index";
const key = (id: string) => `flow:${id}`;

export class FlowConflictError extends Error {}

type Index = Record<string, FlowSummary>;

const summaryOf = (file: FlowFile): FlowSummary => ({
  id: file.id, name: file.name, createdAt: file.createdAt, updatedAt: file.updatedAt,
  nodeCount: file.nodes.length, preview: previewOf(file.nodes, file.edges),
});

/** Read-modify-write the index and one flow inside a single transaction. */
function write(id: string, next: (current: FlowFile | undefined, index: Index) => FlowFile | null): Promise<FlowFile | null> {
  return kv("readwrite", async (store) => {
    const [current, index] = await Promise.all([
      promisifyRequest<FlowFile | undefined>(store.get(key(id))),
      promisifyRequest<Index | undefined>(store.get(INDEX)).then((i) => i ?? {}),
    ]);
    const file = next(current, index);
    if (file) {
      store.put(file, key(file.id));
      store.put({ ...index, [file.id]: summaryOf(file) }, INDEX);
    } else {
      store.delete(key(id));
      const { [id]: _gone, ...rest } = index;
      void _gone;
      store.put(rest, INDEX);
    }
    await promisifyRequest(store.transaction);
    return file;
  });
}

export async function listFlows(): Promise<FlowSummary[]> {
  const index = (await get<Index>(INDEX, kv)) ?? {};
  return Object.values(index).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export const getFlow = (id: string) => get<FlowFile>(key(id), kv);

export async function saveFlow(file: FlowFile, opts: { expectedUpdatedAt?: string } = {}): Promise<FlowFile> {
  const saved = await write(file.id, (current) => {
    if (opts.expectedUpdatedAt && current && current.updatedAt !== opts.expectedUpdatedAt) {
      throw new FlowConflictError("This flow changed in another tab");
    }
    // Strictly later than what is stored, even within one millisecond, so the
    // other-tab guard can always tell two writes apart.
    const floor = Date.parse(current?.updatedAt ?? "") || 0;
    const stamp = new Date(Math.max(Date.now(), floor + 1)).toISOString();
    return { ...file, nodes: toSavedNodes(file.nodes), edges: toSavedEdges(file.edges), updatedAt: stamp };
  });
  return saved!;
}

export async function createFlow(name = "Untitled flow", seed: { nodes: FlowNode[]; edges: FlowEdge[] } = { nodes: [], edges: [] }) {
  return saveFlow(newFlowFile(name, seed.nodes, seed.edges));
}

export async function duplicateFlow(id: string): Promise<FlowFile> {
  const source = await getFlow(id);
  if (!source) throw new Error("This flow doesn't exist");
  return createFlow(`${source.name} copy`, source);
}

export async function renameFlow(id: string, name: string): Promise<FlowFile> {
  const source = await getFlow(id);
  if (!source) throw new Error("This flow doesn't exist");
  return saveFlow({ ...source, name: name.trim() || source.name });
}

export async function deleteFlow(id: string): Promise<void> {
  await write(id, () => null);
}

/** False in a window where IndexedDB is missing or refuses to open. */
export async function storageAvailable(): Promise<boolean> {
  try {
    await get(INDEX, kv);
    return true;
  } catch {
    return false;
  }
}
```
Note for the implementer: the `write` callback throws `FlowConflictError` inside the transaction; `kv("readwrite", …)` rejects with it and the transaction aborts, so nothing is written. The test in Step 2 pins that.

- [ ] **Step 5: Run.** Both test files PASS; `pnpm test` and `pnpm typecheck` green.
- [ ] **Step 6: Commit.** `git add package.json pnpm-lock.yaml lib/flows lib/__tests__/flows-*.test.ts && git commit -m "flows: IndexedDB repository and card previews"`

---

### Task 3: Legacy carry-over (20 min)

**Files:** Create `lib/flows/legacy.ts`, `lib/__tests__/flows-legacy.test.ts`.

**Interfaces:**
- Consumes: `migrate`, `saveFlow`, `listFlows`.
- Produces: `export const LEGACY_KEY = "flow-builder-state"; export const LEGACY_FLAG = "flow-builder-legacy-imported"; export async function importLegacyFlow(): Promise<string | null>` (the new flow's id, or null).

- [ ] **Step 1: Failing tests**
```ts
// lib/__tests__/flows-legacy.test.ts
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
```
- [ ] **Step 2: Run** → FAIL, module missing.
- [ ] **Step 3: Implement**
```ts
// lib/flows/legacy.ts
import { migrate } from "./format";
import { listFlows, saveFlow } from "./repo";

/** Where every version before flow documents kept its one flow. Never deleted. */
export const LEGACY_KEY = "flow-builder-state";
export const LEGACY_FLAG = "flow-builder-legacy-imported";

/**
 * Carry the pre-documents flow over once, as "Untitled flow". Only into an empty
 * repository, only when it has nodes, and only once per browser. The old key
 * stays as a backup.
 */
export async function importLegacyFlow(): Promise<string | null> {
  if (localStorage.getItem(LEGACY_FLAG)) return null;
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw || (await listFlows()).length > 0) return null;
  try {
    const file = migrate(JSON.parse(raw));
    if (file.nodes.length === 0) return null;
    const saved = await saveFlow(file);
    localStorage.setItem(LEGACY_FLAG, "1");
    return saved.id;
  } catch (err) {
    console.warn(`Saved flow from an older version could not be read: ${(err as Error).message}`);
    return null;
  }
}
```
- [ ] **Step 4: Run** → PASS; suite and typecheck green.
- [ ] **Step 5: Commit.** `git commit -m "flows: carry the pre-documents flow over once"` (with the two files added).

---

### Task 4: Store, canvas route, test hook and the scripts' seeding helper (60 min)

**Files:** Modify `lib/store.ts`, `app/page.tsx` (temporary), `lib/__tests__/store.test.ts`; create `app/flows/[id]/page.tsx`, `app/flows/new/page.tsx`, `components/open-flow.tsx`, `lib/flows/debug-hook.ts`, `scripts/lib/flow-session.mjs`; modify every `scripts/check-*.mjs` that opens `/` or reads `flow-builder-state`.

**Interfaces:**
- Consumes: `getFlow`, `createFlow`, `saveFlow`, `migrate`, `importLegacyFlow`.
- Produces (store):
  ```ts
  flowId: string | null; name: string; loadedUpdatedAt: string | null;
  openFlow: (file: FlowFile) => void;      // replaces nodes, edges, flowId, name, loadedUpdatedAt; clears history (Task 6 hooks in)
  setName: (name: string) => void;
  ```
  (`window.__flowBuilder`, browser only): `{ state(): { flowId, name, nodes, edges }; importFlow(file: unknown): Promise<string>; reset(): Promise<void> }`.
  (`scripts/lib/flow-session.mjs`): `RESET_JS: string`, `importJs(file): string`, `stateJs(expr): string`, `legacyFile(nodes, edges)`.

- [ ] **Step 1: Failing store test** (append to `lib/__tests__/store.test.ts`)
```ts
import { newFlowFile } from "../flows/format";

describe("openFlow", () => {
  it("replaces the canvas with the flow and remembers which flow it is", () => {
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    const file = newFlowFile("Lighthouse", [{ id: "video-1", type: "video", position: { x: 5, y: 5 }, data: initialData("video") } as FlowNode]);
    useFlowStore.getState().openFlow(file);
    const s = useFlowStore.getState();
    expect(s.nodes.map((n) => n.id)).toEqual(["video-1"]);
    expect(s).toMatchObject({ flowId: file.id, name: "Lighthouse", loadedUpdatedAt: file.updatedAt });
  });

  it("no longer writes the canvas to localStorage", () => {
    localStorage.clear();
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    expect(localStorage.getItem("flow-builder-state")).toBeNull();
  });
});
```
(`FlowNode` is already imported in that file; add the `newFlowFile` import.)

- [ ] **Step 2: Run** → FAIL (`openFlow` missing; localStorage still written).

- [ ] **Step 3: Store.** In `lib/store.ts`: remove the `persist` import and wrapper (`create<FlowState>()((set, get) => ({ ... }))`), remove the `partialize`/`merge` block (legacy reading now lives in `lib/flows/legacy.ts`, and `markLostClips` runs in `toSavedNodes`). Add to `FlowState` and the initial state:
```ts
  flowId: string | null;
  name: string;
  /** The stored updatedAt this tab loaded or last wrote; the other-tab guard compares against it. */
  loadedUpdatedAt: string | null;
  openFlow: (file: FlowFile) => void;
  setName: (name: string) => void;
```
```ts
      flowId: null,
      name: "Untitled flow",
      loadedUpdatedAt: null,
      openFlow: (file) =>
        set({ flowId: file.id, name: file.name, loadedUpdatedAt: file.updatedAt, nodes: file.nodes, edges: file.edges }),
      setName: (name) => set({ name }),
```
Keep `reset` as `set({ nodes: [], edges: [] })`.

- [ ] **Step 4: Routes.**
```tsx
// components/open-flow.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlowCanvas } from "@/components/flow-canvas";
import { getFlow } from "@/lib/flows/repo";
import { useFlowStore } from "@/lib/store";

/** Loads one flow into the store, then shows the canvas. */
export function OpenFlow({ id }: { id: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => {
    let live = true;
    getFlow(id).then((file) => {
      if (!live) return;
      if (!file) return setState("missing");
      useFlowStore.getState().openFlow(file);
      setState("ready");
    });
    return () => { live = false; };
  }, [id]);

  if (state === "missing") {
    return (
      <main className="grid h-dvh place-items-center text-center">
        <div>
          <p className="text-[15px] font-semibold">This flow doesn&apos;t exist</p>
          <Link href="/" className="mt-2 inline-block text-[13px] text-text-secondary underline">Back to flows</Link>
        </div>
      </main>
    );
  }
  return <main className="h-dvh w-screen">{state === "ready" && <FlowCanvas />}</main>;
}
```
```tsx
// app/flows/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { OpenFlow } from "@/components/open-flow";

export default function FlowPage() {
  const { id } = useParams<{ id: string }>();
  return <OpenFlow id={id} />;
}
```
```tsx
// app/flows/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createFlow } from "@/lib/flows/repo";

/** New flow: create it, then open it. replace() keeps /flows/new out of history. */
export default function NewFlowPage() {
  const router = useRouter();
  useEffect(() => {
    createFlow().then((file) => router.replace(`/flows/${file.id}`));
  }, [router]);
  return <main className="h-dvh" />;
}
```
Temporary `app/page.tsx` until Task 8 (so the app stays usable between tasks): a client page that runs `importLegacyFlow()`, then `listFlows()`, and `router.replace` to the newest flow's `/flows/<id>` or to `/flows/new`.

- [ ] **Step 5: Test hook.**
```ts
// lib/flows/debug-hook.ts
"use client";

import { clear } from "idb-keyval";
import { useFlowStore } from "../store";
import { migrate } from "./format";
import { kv, saveFlow } from "./repo";

/**
 * A small read-and-seed surface for the check scripts, installed in every build:
 * it reads the open flow and adds flows the same way import does, and touches
 * nothing else. The scripts read run state here now that it is no longer saved.
 */
export function installDebugHook() {
  (window as unknown as { __flowBuilder: unknown }).__flowBuilder = {
    state: () => {
      const { flowId, name, nodes, edges } = useFlowStore.getState();
      return { flowId, name, nodes, edges };
    },
    importFlow: async (raw: unknown) => (await saveFlow(migrate(raw))).id,
    reset: async () => {
      await clear(kv);
      localStorage.clear();
    },
  };
}
```
Call `installDebugHook()` once from `components/open-flow.tsx` and the temporary home page (a `useEffect` with `[]`).

- [ ] **Step 6: Seeding helper for scripts.**
```js
// scripts/lib/flow-session.mjs
// Browser-side snippets the check scripts evaluate. Since flow documents, the
// canvas lives at /flows/<id> and state lives in IndexedDB, so a script resets
// storage, imports its flow through window.__flowBuilder, and opens it.

/** Clear flows and localStorage. Needs a page that installed the hook (/ or /flows/new). */
export const RESET_JS = `window.__flowBuilder.reset()`;

/** Import a flow (any shape `migrate` accepts) and resolve to its id. */
export const importJs = (file) => `window.__flowBuilder.importFlow(${JSON.stringify(file)})`;

/** Read something from the open flow, e.g. stateJs("s.nodes.length"). */
export const stateJs = (expr) => `((s) => ${expr})(window.__flowBuilder.state())`;

/** The legacy localStorage shape, which `migrate` lifts, for flows typed out by hand. */
export const legacyFile = (nodes, edges = []) => ({ state: { nodes, edges }, version: 0 });
```
In each script, replace the "navigate APP, `localStorage.clear()` or set `flow-builder-state`, reload" block with: navigate to `${APP_ORIGIN}/flows/new` (wait for `window.__flowBuilder`), `await evaluate(RESET_JS)`, then either `const id = await evaluate(importJs(legacyFile(SAVED.nodes, SAVED.edges)))` and navigate to `/flows/${id}`, or (no seed) navigate to `/flows/new` again for a blank flow. Replace every `JSON.parse(localStorage.getItem("flow-builder-state")).state` read with `stateJs(...)`. `APP_URL` may carry a Vercel share query string: build URLs with `new URL(path, APP_URL)` and keep its `search` on the first navigation only (the share cookie is set by then). Safari scripts use `exec("return " + snippet)` with the same strings.

- [ ] **Step 7: Run.** Store test PASS; `pnpm test`, `pnpm typecheck` green. With `pnpm dev`: every `check-*-chrome.mjs` passes except `check-clip-drop-chrome`'s "a reload keeps stored clips" (needs Task 5's autosave; expected to fail until then). `check-cluster-safari.mjs` and `check-app-safari.mjs` pass.
- [ ] **Step 8: Commit.** `git commit -m "flows: canvas at /flows/[id], store without localStorage, script seeding helper"`

---

### Task 5: Autosave, save state and the two guards (40 min)

**Files:** Create `lib/flows/autosave.ts`, `lib/__tests__/flows-autosave.test.ts`; modify `components/open-flow.tsx`.

**Interfaces:**
- Consumes: store (`flowId`, `name`, `nodes`, `edges`, `loadedUpdatedAt`), `saveFlow`, `getFlow`, `FlowConflictError`.
- Produces:
  ```ts
  export type SaveState = "saved" | "saving" | "failed" | "conflict";
  export const useSaveState: UseBoundStore<StoreApi<{ state: SaveState; retry(): void }>>;
  export function startAutosave(opts?: { delayMs?: number }): () => void;  // returns stop()
  export function flushAutosave(): Promise<void>;
  export function isRunning(): boolean; // any node status "running"
  ```

- [ ] **Step 1: Failing tests**
```ts
// lib/__tests__/flows-autosave.test.ts
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clear } from "idb-keyval";

// The real repository, with a switch to fail the next save the way a full disk would.
const fail = vi.hoisted(() => ({ next: false }));
vi.mock("../flows/repo", async (importOriginal) => {
  const real = await importOriginal<typeof import("../flows/repo")>();
  return {
    ...real,
    saveFlow: async (...args: Parameters<typeof real.saveFlow>) => {
      if (fail.next) { fail.next = false; throw new Error("QuotaExceededError"); }
      return real.saveFlow(...args);
    },
  };
});

import { flushAutosave, startAutosave, useSaveState } from "../flows/autosave";
import { createFlow, getFlow, kv, saveFlow } from "../flows/repo";
import { useFlowStore } from "../store";

let stop = () => {};
beforeEach(async () => {
  await clear(kv);
  const file = await createFlow("A");
  useFlowStore.getState().openFlow(file);
  useSaveState.setState({ state: "saved" });
  stop = startAutosave({ delayMs: 20 });
});
afterEach(() => stop());

const settle = () => new Promise((r) => setTimeout(r, 80));

describe("autosave", () => {
  it("saves a change after the delay and reports saving, then saved", async () => {
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    expect(useSaveState.getState().state).toBe("saving");
    await settle();
    expect(useSaveState.getState().state).toBe("saved");
    expect((await getFlow(useFlowStore.getState().flowId!))!.nodes).toHaveLength(1);
  });

  it("saves a rename", async () => {
    useFlowStore.getState().setName("Renamed");
    await settle();
    expect((await getFlow(useFlowStore.getState().flowId!))!.name).toBe("Renamed");
  });

  it("ignores a selection-only change", async () => {
    const id = useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    await settle();
    const before = (await getFlow(useFlowStore.getState().flowId!))!.updatedAt;
    useFlowStore.getState().onNodesChange([{ type: "select", id, selected: true }]);
    await settle();
    expect((await getFlow(useFlowStore.getState().flowId!))!.updatedAt).toBe(before);
    expect(useSaveState.getState().state).toBe("saved");
  });

  it("stops and says so when another tab saved this flow first", async () => {
    const flowId = useFlowStore.getState().flowId!;
    const other = await getFlow(flowId);
    await new Promise((r) => setTimeout(r, 5));
    await saveFlow({ ...other!, name: "From the other tab" });
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    await settle();
    expect(useSaveState.getState().state).toBe("conflict");
    expect((await getFlow(flowId))!.name).toBe("From the other tab");
  });

  it("flushes a pending save at once", async () => {
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    await flushAutosave();
    expect((await getFlow(useFlowStore.getState().flowId!))!.nodes).toHaveLength(1);
  });

  it("reports a failed write and saves on retry", async () => {
    fail.next = true;
    useFlowStore.getState().addNode("image", { x: 0, y: 0 });
    await settle();
    expect(useSaveState.getState().state).toBe("failed");
    useSaveState.getState().retry();
    await settle();
    expect(useSaveState.getState().state).toBe("saved");
  });
});
```
- [ ] **Step 2: Run** → FAIL, module missing.
- [ ] **Step 3: Implement**
```ts
// lib/flows/autosave.ts
"use client";

import { create } from "zustand";
import { useFlowStore } from "../store";
import { toSavedEdges, toSavedNodes, type FlowFile } from "./format";
import * as repo from "./repo";

export type SaveState = "saved" | "saving" | "failed" | "conflict";

export const useSaveState = create<{ state: SaveState; retry: () => void }>(() => ({
  state: "saved",
  retry: () => {},
}));

/** The part of the store a save writes; a change outside it (selection, measurements, run state) saves nothing. */
function savedShape(s = useFlowStore.getState()) {
  return JSON.stringify({ name: s.name, nodes: toSavedNodes(s.nodes), edges: toSavedEdges(s.edges) });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = "";
let pending: Promise<void> | null = null;

async function save() {
  timer = undefined;
  const s = useFlowStore.getState();
  if (!s.flowId || useSaveState.getState().state === "conflict") return;
  const shape = savedShape(s);
  const file: FlowFile = {
    format: "flow-builder", version: 1, id: s.flowId, name: s.name,
    createdAt: "", updatedAt: s.loadedUpdatedAt ?? "", nodes: s.nodes, edges: s.edges,
  };
  try {
    const current = await repo.getFlow(s.flowId);
    const saved = await repo.saveFlow({ ...file, createdAt: current?.createdAt ?? new Date().toISOString() }, { expectedUpdatedAt: s.loadedUpdatedAt ?? undefined });
    lastSaved = shape;
    useFlowStore.setState({ loadedUpdatedAt: saved.updatedAt });
    useSaveState.setState({ state: savedShape() === shape ? "saved" : "saving" });
  } catch (err) {
    useSaveState.setState({ state: err instanceof repo.FlowConflictError ? "conflict" : "failed" });
  }
}

export function startAutosave({ delayMs = 500 }: { delayMs?: number } = {}): () => void {
  lastSaved = savedShape();
  const schedule = () => {
    clearTimeout(timer);
    useSaveState.setState({ state: "saving" });
    timer = setTimeout(() => { pending = save(); }, delayMs);
  };
  useSaveState.setState({ retry: schedule });
  const unsubscribe = useFlowStore.subscribe((s, prev) => {
    if (s.flowId !== prev.flowId) { lastSaved = savedShape(s); return; }
    if (useSaveState.getState().state === "conflict") return;
    if (savedShape(s) !== lastSaved) schedule();
  });
  const onUnload = () => { if (timer) void flushAutosave(); };
  window.addEventListener("beforeunload", onUnload);
  return () => { unsubscribe(); clearTimeout(timer); window.removeEventListener("beforeunload", onUnload); };
}

export async function flushAutosave(): Promise<void> {
  if (timer) { clearTimeout(timer); pending = save(); }
  await pending;
}

export const isRunning = () => useFlowStore.getState().nodes.some((n) => n.data.status === "running");
```
Performance note: `savedShape` stringifies the flow on every store change; flows here are tens of nodes, so this is well under a millisecond. If a profile ever says otherwise, compare `nodes`/`edges` identity first.

In `components/open-flow.tsx`, after `openFlow(file)`: `const stop = startAutosave();` (stop on unmount, `await flushAutosave()` before unmount navigation). For the leave-mid-run guard, add a `beforeunload` listener that calls `e.preventDefault()` when `isRunning()`; in-app links check it in Task 7.

- [ ] **Step 4: Run** → PASS; suite and typecheck green. `check-clip-drop-chrome.mjs` now passes in full (a reload keeps stored clips).
- [ ] **Step 5: Commit.** `git commit -m "flows: autosave with save state, other-tab guard and a leave-mid-run guard"`

---

### Task 6: Undo and redo (60 min)

**Files:** Modify `lib/node-kinds.ts` (add `results`), `lib/__tests__/node-kinds.test.ts`; create `lib/flows/history.ts`, `lib/__tests__/flows-history.test.ts`; modify `components/open-flow.tsx` (keyboard).

**Interfaces:**
- Consumes: store; `NODE_KINDS`.
- Produces:
  ```ts
  // node-kinds.ts
  export function resultKeys(kind: NodeKind): readonly string[];  // "status", "error" plus the kind's `results`
  // history.ts
  export const useHistory: UseBoundStore<StoreApi<{ canUndo: boolean; canRedo: boolean }>>;
  export function startHistory(opts?: { typingMs?: number; limit?: number }): () => void;
  export function undo(): void;
  export function redo(): void;
  export function batch<T>(fn: () => Promise<T> | T): Promise<T>; // one entry for a multi-step change (clip drop, template)
  ```

- [ ] **Step 1: Failing tests**
```ts
// lib/__tests__/flows-history.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { batch, redo, startHistory, undo, useHistory } from "../flows/history";
import { newFlowFile } from "../flows/format";
import { resultKeys } from "../node-kinds";
import { useFlowStore } from "../store";

let stop = () => {};
const s = () => useFlowStore.getState();
beforeEach(() => {
  s().openFlow(newFlowFile("A"));
  stop = startHistory({ typingMs: 20, limit: 3 });
});
afterEach(() => stop());
const pause = () => new Promise((r) => setTimeout(r, 40));

describe("resultKeys", () => {
  it("lists run state for every kind and each kind's own outputs", () => {
    expect(resultKeys("image")).toEqual(["status", "error", "outputUrl", "videoUrl"]);
    expect(resultKeys("composition")).toEqual(["status", "error", "outputUrl", "videoUrl", "audioUrl"]);
    expect(resultKeys("cluster")).toEqual(["status", "error", "groups", "stub"]);
    expect(resultKeys("reference")).toEqual(["status", "error"]);
  });
});

describe("history", () => {
  it("undoes and redoes adding a node", () => {
    s().addNode("image", { x: 0, y: 0 });
    expect(useHistory.getState().canUndo).toBe(true);
    undo();
    expect(s().nodes).toHaveLength(0);
    redo();
    expect(s().nodes).toHaveLength(1);
  });

  it("records a move once, on drag end", () => {
    const id = s().addNode("image", { x: 0, y: 0 });
    for (const x of [10, 20, 30]) s().onNodesChange([{ type: "position", id, position: { x, y: 0 }, dragging: true }]);
    s().onNodesChange([{ type: "position", id, position: { x: 40, y: 0 }, dragging: false }]);
    undo();
    expect(s().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("coalesces typing into one entry per pause", async () => {
    const id = s().addNode("image", { x: 0, y: 0 });
    for (const prompt of ["a", "a l", "a li"]) s().updateNodeData(id, { prompt });
    await pause();
    s().updateNodeData(id, { prompt: "a lighthouse" });
    await pause();
    undo();
    expect(s().nodes[0].data.prompt).toBe("a li");
    undo();
    expect(s().nodes[0].data.prompt).toBe("");
  });

  it("keeps a finished result through undo", async () => {
    const id = s().addNode("image", { x: 0, y: 0 });
    s().updateNodeData(id, { prompt: "p" });
    await pause();
    s().setNodeStatus(id, "done");
    s().updateNodeData(id, { outputUrl: "https://x.test/paid.png" }, { record: false });
    undo();
    expect(s().nodes[0].data).toMatchObject({ prompt: "", status: "done", outputUrl: "https://x.test/paid.png" });
  });

  it("does not record selection or run status", () => {
    const id = s().addNode("image", { x: 0, y: 0 });
    s().onNodesChange([{ type: "select", id, selected: true }]);
    s().setNodeStatus(id, "running");
    undo();
    expect(s().nodes).toHaveLength(0);
    expect(useHistory.getState().canUndo).toBe(false);
  });

  it("records a batch as one entry", async () => {
    await batch(() => { s().addNode("image", { x: 0, y: 0 }); s().addNode("video", { x: 400, y: 0 }); });
    undo();
    expect(s().nodes).toHaveLength(0);
  });

  it("forgets the oldest entries past the limit and clears on opening another flow", () => {
    for (let i = 0; i < 5; i++) s().addNode("image", { x: i, y: 0 });
    for (let i = 0; i < 5; i++) undo();
    expect(s().nodes).toHaveLength(2);
    s().openFlow(newFlowFile("B"));
    expect(useHistory.getState()).toEqual({ canUndo: false, canRedo: false });
  });
});
```
Note: `updateNodeData(id, data, { record: false })` is new; runners and the executor pass it for result patches (see Step 3). All other store actions record.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**
  1. `lib/node-kinds.ts`: add `results?: readonly string[]` to `KindSpec`; set `results: ["outputUrl", "videoUrl"]` on image, video and tts, `["outputUrl", "videoUrl", "audioUrl"]` on composition, `["groups", "stub"]` on cluster, nothing on reference. Add:
     ```ts
     /** Fields a run writes. Undo copies these forward so a result is never undone. */
     export function resultKeys(kind: NodeKind): readonly string[] {
       return ["status", "error", ...((NODE_KINDS[kind] as KindSpec<NodeKind>).results ?? [])];
     }
     ```
  2. `lib/store.ts`: `updateNodeData(id, data, opts?: { record?: boolean })`; the flag is read by history only (store it on a module-level `lastChange` marker: `{ record: boolean }` set before `set(...)`). `setNodeStatus` always sets `record: false`. `lib/executor.ts` `applyPatch` and `lib/clip-drop.ts` result writes pass `{ record: false }`.
  3. `lib/flows/history.ts`:
     ```ts
     "use client";

     import { create } from "zustand";
     import { resultKeys } from "../node-kinds";
     import { useFlowStore, lastChange } from "../store";
     import type { FlowEdge, FlowNode } from "../types";

     type Snapshot = { nodes: FlowNode[]; edges: FlowEdge[] };
     export const useHistory = create(() => ({ canUndo: false, canRedo: false }));

     let past: Snapshot[] = [];
     let future: Snapshot[] = [];
     let applying = false;
     let batching = 0;
     let typingTimer: ReturnType<typeof setTimeout> | undefined;
     let typingBase: Snapshot | null = null;

     const strip = (nodes: FlowNode[]) =>
       nodes.map(({ id, type, position, data }) => ({ id, type, position, data }) as FlowNode);
     const snap = (): Snapshot => {
       const { nodes, edges } = useFlowStore.getState();
       return { nodes: strip(nodes), edges };
     };
     const publish = () => useHistory.setState({ canUndo: past.length > 0, canRedo: future.length > 0 });

     /** Carry each surviving node's current run results onto a restored snapshot. */
     function keepResults(target: Snapshot): Snapshot {
       const live = new Map(useFlowStore.getState().nodes.map((n) => [n.id, n]));
       return {
         edges: target.edges,
         nodes: target.nodes.map((node) => {
           const now = live.get(node.id);
           if (!now) return node;
           const results = Object.fromEntries(resultKeys(node.type).filter((k) => k in now.data).map((k) => [k, now.data[k]]));
           return { ...now, position: node.position, data: { ...node.data, ...results } } as FlowNode;
         }),
       };
     }

     function restore(target: Snapshot) {
       applying = true;
       useFlowStore.setState(keepResults(target));
       applying = false;
     }

     export function undo() {
       const prev = past.pop();
       if (!prev) return;
       future.push(snap());
       restore(prev);
       publish();
     }

     export function redo() {
       const next = future.pop();
       if (!next) return;
       past.push(snap());
       restore(next);
       publish();
     }

     let limit = 100;
     function push(entry: Snapshot) {
       past.push(entry);
       if (past.length > limit) past.shift();
       future = [];
       publish();
     }

     export async function batch<T>(fn: () => Promise<T> | T): Promise<T> {
       const before = snap();
       batching++;
       try { return await fn(); }
       finally { batching--; if (batching === 0) push(before); }
     }

     export function startHistory({ typingMs = 600, limit: max = 100 }: { typingMs?: number; limit?: number } = {}) {
       limit = max;
       past = []; future = []; publish();
       const unsubscribe = useFlowStore.subscribe((s, prev) => {
         if (s.flowId !== prev.flowId) { past = []; future = []; publish(); return; }
         if (applying || batching || !lastChange.record) return;
         const before: Snapshot = { nodes: strip(prev.nodes), edges: prev.edges };
         if (JSON.stringify(before) === JSON.stringify({ nodes: strip(s.nodes), edges: s.edges })) return; // selection, measurements
         if (lastChange.kind === "drag") return;             // wait for drag end
         if (lastChange.kind === "typing") {
           typingBase ??= before;
           clearTimeout(typingTimer);
           typingTimer = setTimeout(() => { if (typingBase) push(typingBase); typingBase = null; }, typingMs);
           return;
         }
         if (lastChange.kind === "dragEnd") { push(lastChange.dragStart ?? before); return; }
         push(before);
       });
       return () => { unsubscribe(); clearTimeout(typingTimer); };
     }
     ```
     In `lib/store.ts`, export `lastChange: { record: boolean; kind: "edit" | "typing" | "drag" | "dragEnd"; dragStart?: Snapshot }` and set it in each action before `set`: `onNodesChange` sets `drag` for `position` changes with `dragging: true` (capturing `dragStart` on the first one), `dragEnd` for `dragging: false`, `record: false` for `select` and `dimensions`; `updateNodeData` sets `typing` when every changed key is a textarea field of that kind (`NODE_KINDS[kind].fields[key].control === "textarea"`), else `edit`. Reset `lastChange` to `{ record: true, kind: "edit" }` after each `set`.
  4. `components/open-flow.tsx`: `startHistory()` alongside autosave; a `keydown` listener: ignore when `e.target` is an `input`, `textarea` or `[contenteditable]`; `mod+z` → `undo()`, `mod+shift+z` or `ctrl+y` → `redo()`, where `mod` is `metaKey` on Mac and `ctrlKey` elsewhere. Wrap `readClip` in `components/flow-canvas.tsx` and `components/node-toolbar.tsx` with `batch(...)`.

- [ ] **Step 4: Run** → PASS; `lib/__tests__/node-kinds.test.ts` still passes (add the `resultKeys` case there too); suite and typecheck green.
- [ ] **Step 5: Commit.** `git commit -m "flows: undo and redo that keeps run results"`

---

### Task 7: Canvas header and empty canvas (40 min)

**Files:** Create `components/flow-header.tsx`, `components/flow-header.test.tsx`; modify `components/flow-canvas.tsx` (replace `Header`, add empty state).

Run `me:unslop` before and after. Visual source: `draft.html`, frame "Canvas header".

**Interfaces:** Consumes `useFlowStore` (`name`, `setName`, `flowId`, `nodes`), `useSaveState`, `useHistory`, `undo`, `redo`, `isRunning`, `flushAutosave`, `getFlow`, `toExportText`.

- [ ] **Step 1: Failing component tests** (`components/flow-header.test.tsx`, jsdom, mock `next/navigation`'s `useRouter` and `next/link` as a plain `<a>`):
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, ...props }: { href: string }) => <a href={href} {...props} /> }));
import { FlowHeader } from "./flow-header";
import { useSaveState } from "@/lib/flows/autosave";
import { useHistory } from "@/lib/flows/history";
import { newFlowFile } from "@/lib/flows/format";
import { useFlowStore } from "@/lib/store";

beforeEach(() => {
  useFlowStore.getState().openFlow(newFlowFile("Lighthouse at dusk"));
  useSaveState.setState({ state: "saved" });
  useHistory.setState({ canUndo: true, canRedo: false });
});

describe("FlowHeader", () => {
  it("shows the name, the save state and undo, with redo disabled", () => {
    render(<FlowHeader />);
    expect(screen.getByRole("textbox", { name: "Flow name" })).toHaveValue("Lighthouse at dusk");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("renames on Enter and restores the name on Escape", async () => {
    render(<FlowHeader />);
    const input = screen.getByRole("textbox", { name: "Flow name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Harbor{Enter}");
    expect(useFlowStore.getState().name).toBe("Harbor");
    await userEvent.clear(input);
    await userEvent.type(input, "Oops{Escape}");
    expect(input).toHaveValue("Harbor");
  });

  it.each([
    ["saving", "Saving…"],
    ["failed", "Not saved"],
    ["conflict", "Changed in another tab"],
  ] as const)("reads %s as %s with the matching action", (state, label) => {
    useSaveState.setState({ state });
    render(<FlowHeader />);
    expect(screen.getByText(label)).toBeInTheDocument();
    if (state === "failed") expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    if (state === "conflict") expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `FlowHeader`** as the draft's chip: `absolute left-4 top-4 z-10 flex h-10 items-center gap-1 rounded-[var(--radius-card)] border border-border bg-surface-card pl-1 pr-1.5 text-[13px]` (use the Tailwind utilities the tokens already expose; `rounded-xl` is 16px in this project). Parts, left to right:
  - Back link (`next/link` to `/`, lucide `ChevronLeft`, "Flows"). `onClick`: if `isRunning()` and `!confirm("A run is still going. Leave anyway? Its results won't be saved.")`, `preventDefault()`; otherwise `await flushAutosave()` before navigating (use `router.push` after the flush).
  - Hairline `h-4 w-px bg-border`.
  - Name `<input aria-label="Flow name">`, local state; commit `setName(value.trim() || previous)` on Enter or blur, revert on Escape, `w-[152px]` desktop, `w-24` below 480px.
  - Save label `aria-live="polite"`, `min-w-14 text-[12px] text-text-tertiary`: saved → "Saved", saving → "Saving…", failed → "Not saved" plus a `Retry` text button calling `useSaveState.getState().retry()`, conflict → "Changed in another tab" plus `Reload` (`location.reload()`). Hidden below 480px.
  - Hairline, then icon buttons (`aria-label` and `title`): Undo (`Undo2`, disabled when `!canUndo`), Redo (`Redo2`, disabled when `!canRedo`), Export (`Download`): `getFlow(flowId)` → `toExportText` → download `<name>.flow.json` via a Blob URL and a temporary `<a download>`.
- [ ] **Step 4: Empty canvas.** In `components/flow-canvas.tsx`, when `nodes.length === 0`, render a centered `pointer-events-none` block (its button `pointer-events-auto`): "Add a node from the toolbar, or drop a clip to build a graph from it" (14px, `text-text-secondary`) and a `Choose clip` Button that clicks the toolbar's file input (lift the input's ref, or export a `chooseClip()` from `node-toolbar.tsx`).
- [ ] **Step 5: Run.** Tests PASS; suite and typecheck green; `me:unslop` Phase 2 clean on the two files.
- [ ] **Step 6: Commit.** `git commit -m "flows: canvas header with name, save state, undo, redo and export"`

---

### Task 8: Home page (90 min)

**Files:** Replace `app/page.tsx`; create `components/home/app-shell.tsx`, `components/home/flow-card.tsx`, `components/home/flow-thumb.tsx`, `components/home/flow-grid.tsx`, `components/home/delete-flow-dialog.tsx`, `components/home/import-button.tsx`, `components/home/home.test.tsx`.

Run `me:unslop` before and after. Visual source: `draft.html` (both states, 1440 and 375).

**Interfaces:** Consumes `listFlows`, `createFlow`, `duplicateFlow`, `renameFlow`, `deleteFlow`, `saveFlow`, `storageAvailable`, `importLegacyFlow`, `parseImport`, `FlowFormatError`, `getFlow`, `toExportText`, `FlowPreview`, `TEMPLATES` (Task 9 renders the row; until then render the row from an empty array). Produces `FlowThumb({ preview })` (Task 9 reuses it) and `AppShell({ children })` (Task 9's `/templates` reuses it).

- [ ] **Step 1: Failing component tests** (`components/home/home.test.tsx`, `import "fake-indexeddb/auto"`, mock `next/navigation`):
```tsx
import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clear } from "idb-keyval";
import { beforeEach, describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: push }) }));
vi.mock("next/link", () => ({ default: ({ href, ...props }: { href: string }) => <a href={href} {...props} /> }));
import Home from "@/app/page";
import { createFlow, kv, listFlows } from "@/lib/flows/repo";

beforeEach(async () => {
  await clear(kv);
  localStorage.clear();
  push.mockClear();
});

describe("Home", () => {
  it("shows the first-run box when there are no flows", async () => {
    render(<Home />);
    expect(await screen.findByText("No flows yet")).toBeInTheDocument();
  });

  it("lists flows newest first with name and node count", async () => {
    await createFlow("Older");
    await new Promise((r) => setTimeout(r, 5));
    await createFlow("Newer");
    render(<Home />);
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Newer", "Older"]);
    expect(within(cards[0]).getByText(/0 nodes/)).toBeInTheDocument();
  });

  it("filters by search and says when nothing matches", async () => {
    await createFlow("Lighthouse");
    await createFlow("Harbor");
    render(<Home />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search flows" }), "light");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search flows" }), "zzz");
    expect(screen.getByText(/No flows match/)).toBeInTheDocument();
  });

  it("deletes only after the confirm dialog", async () => {
    await createFlow("Doomed");
    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "More for Doomed" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete flow" }));
    expect(await screen.findByText('Delete "Doomed"? This can\'t be undone.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete flow" }));
    await waitFor(async () => expect(await listFlows()).toEqual([]));
  });

  it("duplicates and renames from the menu", async () => {
    await createFlow("Lighthouse");
    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "More for Lighthouse" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    await waitFor(async () => expect((await listFlows()).map((s) => s.name)).toContain("Lighthouse copy"));
  });

  it("carries the legacy flow over on first load", async () => {
    localStorage.setItem("flow-builder-state", JSON.stringify({ state: { nodes: [{ id: "image-a", type: "image", position: { x: 0, y: 0 }, data: { status: "idle", prompt: "", model: "flux-dev" } }], edges: [] }, version: 0 }));
    render(<Home />);
    expect(await screen.findByRole("heading", { name: "Untitled flow" })).toBeInTheDocument();
  });

  it("opens New flow at /flows/new", async () => {
    render(<Home />);
    await userEvent.click(await screen.findByRole("button", { name: "New flow" }));
    expect(push).toHaveBeenCalledWith("/flows/new");
  });
});
```
(Radix menus need the pointer shims already in `vitest.setup.ts`.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, matching `draft.html` class for class where the draft and the tokens agree:
  - `AppShell`: grid `232px minmax(0,1fr)`; sidebar `bg-surface-sidebar border-r border-border p-3`, brand row "Flow Builder" plus a collapse button (`PanelLeft`, `aria-label="Collapse sidebar"`), collapsed width 56px with icon-only links keeping their names as `aria-label` and `title`, collapsed state in `localStorage["flow-builder-sidebar"]` read in a `useEffect` and wrapped in try/catch; nav links Flows (`/`) and Templates (`/templates`) with `aria-current="page"`. Below 720px: the sidebar hides and a 52px top bar with a menu button opens it as an overlay (`Dialog` from `components/ui` with `side` styling is modal; use a plain positioned panel with an Escape handler instead, as the inspector does). Use `minmax(0,1fr)` for every column holding the templates row (the draft's overflow lesson).
  - Page head: `h1` "Flows" 24px semibold; `ImportButton` (hidden `<input type="file" accept=".json,application/json">`; on change `parseImport(await file.text())` → `saveFlow` → refresh list; `FlowFormatError` shows its message in a `role="alert"` line under the head for 6s) and `Button` "New flow" → `router.push("/flows/new")`.
  - Templates row (Task 9 fills it).
  - "Recent flows" `h2`; `Input type="search" aria-label="Search flows"` full width; "Sort by" pill with a native `select` (Last edited, Name, Created).
  - `FlowGrid`: `grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-x-5 gap-y-6`; loading shows 3 `Skeleton` cards matching card anatomy; empty repo shows the draft's first-run box; no match shows "No flows match "<q>"" and a `Clear search` button; storage unavailable shows "Flows can't be saved in this browser window. Export anything you want to keep."
  - `FlowCard` (`<article>`): `<Link href={`/flows/${id}`} aria-label={`Open ${name}`}>` wrapping `FlowThumb`; below it `h3` name (14px medium, truncate, `title` = full name) and "Updated <relative> · N node(s)"; `DropdownMenu` trigger `aria-label={`More for ${name}`}` with items Rename (turns the `h3` into an `Input`; Enter commits via `renameFlow`, Escape cancels), Duplicate, Export .flow.json, separator, Delete flow (`text-text-destructive`) → `DeleteFlowDialog` (`Dialog`: title `Delete "<name>"? This can't be undone.`, Cancel, destructive `Delete flow`).
  - `FlowThumb`: if `preview.image`, an `<img>` with `object-cover`; otherwise the draft's `graph()` as a React SVG: nodes as 64 to 84 by 44 rounded rects, port dots in `HANDLE_COLORS`, edges as cubic curves, shared scale (`viewBox` width at least 420 units), dotted background. Port positions come from `shellPorts(kind)` so they match the canvas.
  - Relative time: `Intl.RelativeTimeFormat` for under 7 days ("12 min ago", "yesterday"), else "Sep 12".
  - On mount: `await importLegacyFlow()` then `listFlows()`; also `installDebugHook()`.
- [ ] **Step 4: Run.** Tests PASS; suite and typecheck green; `me:unslop` Phase 2 on `components/home/*`, including 375px and both states rendered with the measure script pattern from the draft (true 375px viewport by CDP `Emulation.setDeviceMetricsOverride`, not a headless window size).
- [ ] **Step 5: Commit.** `git commit -m "flows: home page listing flows"`

---

### Task 9: Templates (40 min)

**Files:** Create `lib/flows/templates.ts`, `lib/__tests__/flows-templates.test.ts`, `components/home/templates-row.tsx`, `app/templates/page.tsx`; modify `app/page.tsx`.

**Interfaces:**
- Consumes: `newFlowFile`, `migrate`, `initialData`, `previewOf`, `createFlow`, `FlowThumb`, `AppShell`.
- Produces: `export interface Template { id: string; name: string; description: string; build(): FlowFile }`, `export const TEMPLATES: Template[]`.

- [ ] **Step 1: Failing tests**
```ts
// lib/__tests__/flows-templates.test.ts
import { describe, expect, it } from "vitest";
import { migrate, parseImport, toExportText } from "../flows/format";
import { TEMPLATES } from "../flows/templates";

describe("TEMPLATES", () => {
  it("offers the four agreed templates in order", () => {
    expect(TEMPLATES.map((t) => t.name)).toEqual(["Image to video", "Video with voiceover", "Ideas to images", "Recreate a clip"]);
  });

  it.each(TEMPLATES.map((t) => [t.name, t] as const))("%s builds a flow that passes import validation", (_name, t) => {
    const file = t.build();
    expect(() => migrate(file)).not.toThrow();
    expect(parseImport(toExportText(file)).nodes).toHaveLength(file.nodes.length);
  });

  it("wires Image to video end to end", () => {
    const { nodes, edges } = TEMPLATES[0].build();
    expect(nodes.map((n) => n.type)).toEqual(["image", "video", "composition"]);
    expect(edges.map((e) => `${e.sourceHandle}->${e.targetHandle}`)).toEqual([
      `${nodes[0].id}:image->${nodes[1].id}:image`,
      `${nodes[1].id}:video->${nodes[2].id}:video`,
    ]);
  });

  it("leaves Ideas to images unwired, since a cluster has no outputs until something is pinned", () => {
    const { nodes, edges } = TEMPLATES[2].build();
    expect(nodes.map((n) => n.type)).toEqual(["cluster", "image", "image"]);
    expect(edges).toEqual([]);
  });

  it("opens Recreate a clip empty", () => {
    expect(TEMPLATES[3].build().nodes).toEqual([]);
  });

  it("gives every build fresh ids", () => {
    expect(TEMPLATES[0].build().id).not.toBe(TEMPLATES[0].build().id);
  });
});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `lib/flows/templates.ts`: each `build()` returns `newFlowFile(name, nodes, edges)` with nodes made by a local `node(kind, x, y)` helper (`{ id: \`${kind}-${i}\`, type: kind, position: { x, y }, data: initialData(kind) }`) and edges by `edge(a, type, b, targetType)` using `handleId`. Positions use `COLUMN_GAP` (480) and `ROW_GAP` (400) from `lib/flow-doc.ts`. Descriptions: "Image into video into a composition", "Video and speech into one composition", "Pin two ideas, then wire them to the images", "Opens ready for a dropped clip".
- [ ] **Step 4: UI.** `TemplatesRow` renders `TEMPLATES` as the draft's row (`grid-flow-col auto-cols-[minmax(220px,1fr)] overflow-x-auto`), each a `<button>` with `FlowThumb preview={previewOf(t.build().nodes, t.build().edges)}` (for Recreate a clip, a thumb with the text "Drop a clip" centred), name and description; click → `createFlow(t.name, t.build())` → `router.push(\`/flows/${id}\`)`. "View all ›" links `/templates`. `app/templates/page.tsx`: `AppShell` with `h1` "Templates" and the same buttons in a `minmax(300px,1fr)` grid.
- [ ] **Step 5: Run.** Tests PASS; suite and typecheck green; `me:unslop` clean.
- [ ] **Step 6: Commit.** `git commit -m "flows: four templates, a templates row and /templates"`

---

### Task 10: Browser checks, docs and the full pass (60 min)

**Files:** Create `scripts/check-flows-chrome.mjs`; modify `scripts/check-app-safari.mjs` (add a flows section), `CONCEPT.md`, `docs/builds/flow-documents/spec.md` (status line, the one-store correction).

- [ ] **Step 1: `check-flows-chrome.mjs`** (harness copied from `check-runall-chrome.mjs`, seeding through `scripts/lib/flow-session.mjs`). Checks, each a `check(name, ok, detail)`:
  1. Reset, write a legacy `flow-builder-state` with the runall graph, open `/`: one card "Untitled flow · 4 nodes"; the legacy key is still present.
  2. Open it: 3 edges drawn; header reads "Untitled flow" and "Saved".
  3. Rename in the header to "Lighthouse" and press Enter; within 2s the label reads "Saved"; reload: the name is still "Lighthouse" and all 4 nodes are in place.
  4. Back to Flows: the card reads "Lighthouse".
  5. New flow: lands on `/flows/<id>`, empty-canvas message visible; add an image from the toolbar; back: 2 cards, newest first.
  6. Undo: on the Lighthouse flow, move the image node by dragging (CDP mouse events), press Cmd+Z: it returns to its old position; Cmd+Shift+Z: it moves back.
  7. Result survives undo: Run the image node (stub mode), wait for done, type in its prompt, pause 1s, Cmd+Z: prompt restored and the output image still shown.
  8. Export from the card menu (intercept the download with `Browser.setDownloadBehavior` into a temp dir), then Import that file: a third card "Lighthouse" with a different id and equal node count.
  9. Delete the imported copy: the dialog appears; confirm: 2 cards.
  10. Template "Image to video": opens a flow with 3 nodes and 2 edges drawn.
  11. Home at a true 375px viewport (`Emulation.setDeviceMetricsOverride`): document width 375, no element past the right edge outside the templates row.
- [ ] **Step 2: Safari.** Add checks 1 to 5 and 10 to `check-app-safari.mjs` using `exec` with the same snippets. Keyboard shortcuts through safaridriver's actions API (`` for Meta).
- [ ] **Step 3: Full pass, local.** `pnpm test`, `pnpm typecheck`, then with `pnpm dev` every `scripts/check-*-chrome.mjs` and both Safari scripts. Record counts.
- [ ] **Step 4: Docs.** `CONCEPT.md` "Out of scope": remove "saved templates". Spec status line: "Built <date> on `flow-documents`, PR #<n>"; add the one-store correction to spec section 5 "Storage".
- [ ] **Step 5: Commit and ship** with `me:ship`: push `flow-documents`, open the PR, and re-run the Chrome checks and the Safari script against the Vercel preview through a share link from the claude.ai Vercel connector.

---

## Self-review against the spec
- Section 3 items 1 to 6: tasks 8, 4 (`/flows/new`), 7, 6, 8 (import), 3. Covered.
- Section 4 "In": templates page (9), empty canvas (7), first-run and error states (8), Chrome and Safari (10).
- Section 5 units: every row maps to a task (format 1, repo and preview 2, legacy 3, templates 9, history 6, autosave 5, home 8, canvas route 4, header 7).
- File format rules (runtime fields dropped, status idle, no error, blob URLs dropped, newer version refused, import validation, new id): Task 1 tests.
- Storage (index read alone, one transaction, unavailable state): Tasks 2 and 8.
- Thumbnails (image first, never data URLs, shared scale): Tasks 2 and 8.
- Routes and the leave-mid-run guard: Tasks 4, 5, 7.
- Undo rules (recorded events, drag end, typing coalesced, batches, results kept, 100 cap, cleared on switch): Task 6 tests.
- Autosave (500ms, three states, beforeunload flush, other tab): Task 5 tests.
- Templates (four, Ideas unwired, Recreate empty): Task 9 tests.
- Open-for-Nick defaults (sidebar collapse kept, confirm dialog, `/templates` kept): Tasks 8 and 9.
- Changes to existing code (store, page, canvas header, scripts, CONCEPT, package.json): Tasks 4, 7, 8, 10, 2.
