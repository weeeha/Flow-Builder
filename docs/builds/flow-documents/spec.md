# Flow documents (engine part B)

Status: spec, 2026-09-26 · Base: main 8664e70 · Draft approved by Nick 2026-09-26 (flows home, ElevenLabs and Runway shell) · Nothing built yet

## 1. TL;DR
Flow Builder today has one flow, saved silently to localStorage under `flow-builder-state`. This build makes flows documents: many named flows stored in the browser's IndexedDB, a home page at `/` that lists them (the approved draft), the canvas moving to `/flows/[id]`, export and import as `.flow.json`, a versioned file format with migrations, undo and redo, a visible autosave state, and four templates. Today's saved flow carries over as the first flow; nothing is deleted. No server, no keys, no new infrastructure.

## 2. Decisions this spec rests on
Nick, 2026-09-23 to 2026-09-26: engine parts B and C before A and D, B first (answers "B then C"); flows live in the browser plus export and import (3A); scope is several flows, export and import, a versioned format, undo and redo, templates and a visible autosave (4: all six); a home page lists the flows, in the ElevenLabs Flows and Runway Workflows shell (draft approved, answer 1).

## 3. What the user sees
1. `/` opens the home page: sidebar (Flows, Templates), "Flows" with Import and New flow, a Templates row, then Recent flows with search, sort and a grid of cards. Each card shows a thumbnail, the name, "Updated … · N nodes" and a ⋯ menu (Rename, Duplicate, Export .flow.json, Delete flow).
2. New flow creates "Untitled flow" and opens it at `/flows/[id]`. A template creates a flow from that template and opens it.
3. On the canvas, the old "Flows | Untitled flow" chip becomes: ‹ Flows · editable name · Saved · undo · redo · export. Every change autosaves; the label reads "Saving…", then "Saved", or "Not saved" with Retry if the browser refused the write.
4. Cmd+Z and Cmd+Shift+Z (Ctrl on other systems, Ctrl+Y too) undo and redo canvas edits. Inside a text field they stay the field's own text undo.
5. Import takes a `.flow.json` file and adds it as a new flow; it never overwrites one.
6. The first time the new version loads, the flow saved under `flow-builder-state` appears on the home page as "Untitled flow", with its nodes, wires, prompts and outputs.

## 4. Scope
**In:** everything in section 3; the Templates page at `/templates` listing all templates; a canvas empty state; first-run and error states on the home page; Chrome and Safari checks.

**Out:** server storage and sync (part D); sharing links; folders or projects (Runway's "By Project" tab); multi-user editing; thumbnails captured from the rendered canvas; undo history that survives a reload; custom node kinds in templates (part C).

## 5. Design

### Units
| Unit | File | Does | Depends on |
|---|---|---|---|
| File format | `lib/flows/format.ts` | `FlowFile` type and zod schema, `CURRENT_VERSION`, `migrate(raw)`, `toExport(file)`, `parseImport(text)` | zod, `NODE_KIND_LIST` |
| Repository | `lib/flows/repo.ts` | IndexedDB reads and writes: `listFlows`, `getFlow`, `saveFlow`, `createFlow`, `duplicateFlow`, `renameFlow`, `deleteFlow` | idb-keyval, format |
| Preview | `lib/flows/preview.ts` | `previewOf(nodes, edges)`: the small summary a card draws | node-kinds |
| Legacy import | `lib/flows/legacy.ts` | one-time move of `flow-builder-state` into the repository | repo, format, `markLostClips` |
| Templates | `lib/flows/templates.ts` | four templates as hand-written `FlowFile`s, positions included | format, node-kinds |
| History | `lib/flows/history.ts` | undo and redo stacks over the open flow | store |
| Autosave | `lib/flows/autosave.ts` | debounced save of the open flow, and the save state | store, repo |
| Home | `app/page.tsx`, `components/home/*` | the approved draft | repo, preview, templates, components/ui |
| Canvas route | `app/flows/[id]/page.tsx` | loads a flow into the store, mounts `FlowCanvas` | repo, store |
| Canvas header | `components/flow-header.tsx` | back link, name, save state, undo, redo, export | history, autosave |

The store (`lib/store.ts`) stays the single live copy of the open flow, so the executor, runners and clip drop keep working unchanged. It gains `flowId`, `name` and `openFlow(file)`, and loses its localStorage `persist` wrapper; the repository replaces it.

### File format
```ts
// lib/flows/format.ts
export const CURRENT_VERSION = 1;

export interface FlowFile {
  format: "flow-builder";
  version: 1;
  id: string;            // crypto.randomUUID()
  name: string;
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
  nodes: FlowNode[];     // position and data only; see "What is saved"
  edges: FlowEdge[];     // id, source, target, sourceHandle, targetHandle
}
```
- **What is saved:** node `id`, `type`, `position`, `data`; edge `id`, `source`, `target`, `sourceHandle`, `targetHandle`. React Flow's runtime fields (`selected`, `dragging`, `measured`, edge `style`) are dropped. `data.status` is saved as `"idle"` and `data.error` is dropped, so a flow never reopens mid-run.
- **Versioning:** every stored and exported file carries `version`. `migrate(raw)` runs a chain `MIGRATIONS[n]: (file) => file` up to `CURRENT_VERSION`; a file newer than the app is refused with "This flow was saved by a newer Flow Builder". Version 0 is the legacy localStorage shape `{ state: { nodes, edges }, version: 0 }`.
- **Import validation:** zod checks the envelope, that every node type is in `NODE_KIND_LIST`, that positions are numbers, and that every edge's ends exist; node `data` passes through, then `initialData(kind)` fills any missing keys. An invalid file shows the reason and adds nothing. Import always assigns a new `id` and keeps the name.
- **Export:** the same shape, pretty-printed, named `<name>.flow.json`. Session-only clip URLs (`blob:`) are dropped and the card marked missing, as a reload already does.

### Storage
- IndexedDB through `idb-keyval` (6.3.0, one small dependency), database `flow-builder`, two stores: `flows` (id to `FlowFile`) and `index` (id to `FlowSummary { id, name, createdAt, updatedAt, nodeCount, preview }`). The home page reads only `index`, so it never loads every flow's full data.
- `saveFlow` writes both in one transaction. `updatedAt` changes on every save.
- IndexedDB works in Chrome and Safari; Safari's private windows are part of the browser pass rather than assumed. If it is unavailable or throws, the home page shows "Flows can't be saved in this browser window" and the canvas works unsaved, with "Not saved" in its header.

### Thumbnails
`previewOf` stores each node's kind and position and each edge's two node indexes, plus `image`: the first `http(s)` `outputUrl` among image nodes, if any. A card draws the image when there is one and otherwise the graph at one shared scale (the draft's rule, so small graphs stay small). `data:` URLs are never used as thumbnails.

### Legacy import
On first load of any route, if the `flows` store is empty, the `flow-builder-legacy-imported` flag is unset, and `flow-builder-state` holds at least one node: create "Untitled flow" from it (through `migrate` from version 0 and `markLostClips`), set the flag, and keep `flow-builder-state` untouched as a backup. Runs once; an empty legacy state creates nothing.

### Routes and navigation
- `/`: home. `/templates`: all templates. `/flows/[id]`: canvas. An unknown id shows "This flow doesn't exist" with a link home.
- Sidebar on `/` and `/templates` only; the canvas stays full-screen, as today.
- Leaving a flow while a node is running asks "A run is still going. Leave anyway? Its results won't be saved." Runs belong to the open flow until part D moves them to the server.

### Undo and redo
- An entry is recorded for: add node, delete node, move node (on drag end, not every frame), connect, delete edge, a param change from the inspector, a pin or unpin, and a prompt edit (coalesced: one entry per pause of 600ms in typing or on blur). Clip drops and template graphs record one entry for the whole landing.
- Not recorded: selection, run status, run results, React Flow measurements.
- Run results survive undo. Undo restores the recorded nodes and edges, then copies each surviving node's current result keys back onto it. Each kind declares its result keys in `NODE_KINDS` (new field `results`). All kinds: `status`, `error`. Image, video, tts: `outputUrl`, `videoUrl`. Composition: `outputUrl`, `videoUrl`, `audioUrl`. Cluster: `groups`, `stub` (its `pinned` and `outputTexts` are user edits and do undo). Reference: none beyond the shared two. A paid generation is never lost to Cmd+Z.
- 100 entries per flow, in memory, cleared when another flow opens.

### Autosave
The store is subscribed; a change that alters the saved shape (not selection or measurements) schedules a save 500ms later. States: "Saving…" while pending, "Saved" after the write, "Not saved · Retry" on failure. `beforeunload` flushes a pending save. Two tabs on one flow: before writing, the repository compares the stored `updatedAt` with the one the tab loaded; if the other tab wrote since, the header shows "Changed in another tab · Reload" and this tab stops saving until reloaded.

### Templates
| Name | Graph |
|---|---|
| Image to video | image → video → composition |
| Video with voiceover | video and tts → composition |
| Ideas to images | a cluster beside two image nodes, unwired: a cluster has no outputs until something is pinned, so the card says "Pin two ideas, then wire them to the images" |
| Recreate a clip | an empty flow named "Recreate a clip"; the canvas empty state below invites the drop |

The draft showed a reference node on "Recreate a clip"; a reference can only come from a dropped clip, so this template opens empty and its thumbnail shows the empty state. Every empty canvas shows: "Add a node from the toolbar, or drop a clip to build a graph from it" with a Choose clip button.

### States (home)
Loading: card-shaped skeletons (`components/ui/skeleton`). Empty: the draft's first-run box. Search with no match: "No flows match "…"" and Clear search. Storage unavailable: the message above. Delete asks first ("Delete "Lighthouse at dusk"? This can't be undone.") with Cancel and Delete flow.

## 6. Changes to existing code
- `lib/store.ts`: drop `persist`; add `flowId`, `name`, `openFlow(file)`, `setName`; `reset` clears to an empty flow.
- `app/page.tsx`: becomes the home page. The canvas moves to `app/flows/[id]/page.tsx`.
- `components/flow-canvas.tsx`: the `Header` chip is replaced by `FlowHeader`; add the empty-canvas state.
- `lib/clip-upload.ts`: unchanged; `markLostClips` is reused by legacy import and export.
- `scripts/*-chrome.mjs`, `scripts/check-app-safari.mjs`: they seed `flow-builder-state` and open `/`. A shared helper seeds through the legacy import instead (clear storage, write the legacy key, open `/`, open the imported flow), which also exercises that path on every run.
- `CONCEPT.md`: "saved templates" moves out of "Out of scope".
- `package.json`: `idb-keyval` (dependency), `fake-indexeddb` (dev dependency, for unit tests).

## 7. Testing
Unit (Vitest, jsdom with `fake-indexeddb`): format round trip, every migration, refusal of a newer version, import validation (unknown kind, dangling edge, bad JSON); repository create, list order, rename, duplicate, delete, and the index staying in step with flows; legacy import running once and keeping the backup; `previewOf`; history (recorded and unrecorded events, coalesced typing, results surviving undo, the 100 cap); autosave debounce, failure state, and the other-tab guard; every template passing import validation and opening.

Browser (Chrome by CDP, Safari by safaridriver, local and on the deployed preview): legacy flow appears on first load; New flow, rename from the card and from the header, reload keeps all of it; switching flows keeps each flow's nodes; export then import gives an equal flow with a new id; undo and redo of add, move, connect, delete and a prompt edit, with a finished image surviving undo; delete asks and removes; a template opens wired; home at 375px; every existing check still passes through the new seeding helper.

## 8. Risks
1. The store losing `persist` is the riskiest change: every current check seeds through it. Mitigation: the seeding helper lands in the first task, and the suite runs after each task.
2. Safari evicts script-written storage after 7 days without a visit, unless the site is added to the Dock. Flows could vanish for an occasional Safari user. Mitigation now: say so on the home page's storage message and lean on export; the real fix is server storage in part D. `navigator.storage.persist()` is requested on first save (Chrome grants it for engaged sites; Safari's answer varies).
3. Undo that keeps results is custom logic; the result-key list must grow when a kind gains a result field. Mitigation: the list lives in `NODE_KINDS` beside each kind, so the registry reminds whoever adds one.

## 9. Open for Nick
1. Sidebar collapse: kept from the draft, but with two items it earns little. Default: keep it, collapsed state saved per browser.
2. Delete: a confirm dialog (default) or an undoable "Deleted · Undo" toast.
3. Templates page at `/templates` when there are only four: default keep, since part C will add kinds and templates grow with it.
