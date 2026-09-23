# Clip to graph

Status: refreshed 2026-09-20 from the 2026-09-19 draft · Built 2026-09-23, tasks 1-12, on `clip-to-graph` (4201425), PR #6 · Chrome verified in stub mode; Safari and a live model call not verified

Where the build differs from this spec, decided 2026-09-23:
- `generateText` with `Output.object` instead of `generateObject` (deprecated since AI SDK 6), and frames go as file parts with `mediaType: "image/jpeg"` (image parts are deprecated in AI SDK 7).
- `breakdownToGraph(breakdown, hasAudio)` takes the audio flag; its tts speaks the summary as a placeholder.
- `layoutGraph` spacing is 480 x 400, measured from the cards; 320 x 220 overlaps them.
- The reference card keeps 3 of the 8 frames (first, middle, last) to hold localStorage use near 41KB per clip (Nick, 7A). All 8 go to the analysis.
- A drop slides the reference card and the graph clear of existing cards with `clearSpot` (Nick, 8A).
- A clip over 60s is read from its first 60s automatically and the card says so, rather than asking first.
- `edgeIsValid` rejects a named port on a model kind (Nick, 1A), and checks that each handle id names its own end of the edge.
- `loadGraph` drops a param value the registry does not offer (an unknown model name) and keeps the kind's default.

## 1. TL;DR
You drop a video clip on the canvas. A vision model reads eight sampled frames and proposes a shot breakdown plus a node graph approximating it: image into video into composition. The same typed-handle rule that stops you wiring audio into an image input by hand validates the model's graph, repairs it once, then falls back to a graph built from the breakdown. Every run logs which path produced the graph, so the first-pass validity rate is measurable over time.

## 2. Changes since the 2026-09-19 draft
- `NODE_HANDLES` (task 2) now derives from `lib/node-kinds.ts`'s `NODE_KINDS` when that registry slice has landed; the hand-written table is kept only as a fallback. Task numbers stay 1 to 12 either way. Nick's build order of 2026-09-20 lands the whole registry (slices 1 to 3) before this build, so the derived path is the expected one and the fallback is documentation only.
- Model vocabulary locked to four kinds: image, video, tts, composition. `validateGraph` rejects `cluster` and `reference` from a model-authored graph even after the registry lists ports for both.
- The `reference` kind's registration now has two documented paths: through `NODE_KINDS` if the registry exists, or through the same hand-edited files the original draft named.
- The reference node's UI is specified against the live `tts-node.tsx` conversion (`BaseNode`, `TypedHandle`, `MediaSlot`, `toFlowStatus`) instead of a generic description, with `MediaSlot`'s and `NodeStatusBadge`'s real props quoted below.
- Hybrid params (decision 2C, CONCEPT.md): the reference node has no inspector fields yet. Everything it needs stays on the card.
- Shared contract with build 07: this build's `/api/analyze/clip` and build 07 task 10's `/api/generate/cluster` are the first two routes on this line to branch on `hasLlmKey()` inside a route handler. The three routes that exist today (image, video, speech) each stub on their own provider key instead.
- Symbols re-checked against the current code; several moved since 2026-09-19 (`tts-node.tsx` is now built from kit pieces, `cluster` is registered in `flow-canvas.tsx` and `node-toolbar.tsx`, `lib/models.ts` gained Runway-routed video models). Citations below name symbols instead of line numbers, since a cited line in the 2026-09-19 draft had already gone stale by this refresh.

## 3. What the user sees
1. Drag a short video file over the canvas. A full-canvas overlay reads "Drop to read the clip."
2. Drop it. A reference node appears at the drop point, "sampling frames 0/8," thumbnails filling to 8/8.
3. Status switches to "reading the shot" while frames go to the model, or the stub fixture.
4. Nodes and edges appear together, one shot at a time, 150ms apart: image node (imagePrompt) into video node (videoPrompt, duration, model), up to three shots, then composition, then tts if audio is present or unknown.
5. The reference node settles: "1 shot, push-in, dusk" and a path label, first pass, repaired, or fallback.
6. Run all. Stub mode returns placeholder assets, so the graph completes with zero keys.
7. Nothing else on the canvas moved; `loadGraph` only adds.

## 4. Scope
**In v1:** drop anywhere plus a keyboard "Choose clip" button; frame sampling needing zero keys; `POST /api/analyze/clip` returning a zod-validated ClipAnalysis; `validateGraph`, one repair pass, deterministic fallback; `loadGraph` merging additively; a reference node with clip, frame strip, summary and path label; a local validity-rate log.

**Thin slice (3 h), stop here if building today:** sampling, a stub-only analyze call, `validateGraph`, `layoutGraph`, `loadGraph`, single shot, nodes landing together with no stagger, a minimal reference node with no frame strip yet. No repair, fallback, log, Choose clip button, or new error states.

**Out:** audio transcription, multi-video sequencing (composition still plays only `inputs.videos[0]`), editing the breakdown, saving analyses beyond the validity counts, matching the clip's exact look, "start from a cluster" (needs build 07 first).

## 5. Design

### Architecture
- `lib/node-kinds.ts` (registry slice 1, a prerequisite this build does not own): if it exists, its `NODE_KINDS` table supplies port data for `NODE_HANDLES` below and gains a `reference` entry alongside this build. See "Before you start" in plan.md for the fallback.
- `lib/frames.ts`: `sampleFrames(file, n=8)`, browser-only frame grab.
- `lib/flow-doc.ts`: FlowDoc type/schema, `NODE_HANDLES`, `validateGraph`, `layoutGraph`, `breakdownToGraph`, `edgeIsValid` [HAND]. Depends on lib/handles.ts (F2) and, when present, lib/node-kinds.ts.
- `lib/clip-log.ts`: localStorage counter, first pass / repaired / fallback / stub.
- `lib/stubs/clip-analysis.json`: no-key fixture, a full ClipAnalysis. Second fixture in lib/stubs/, alongside build 07's cluster.json.
- `app/api/analyze/clip/route.ts`: the LLM call and repair loop. Depends on lib/llm.ts (F4), lib/flow-doc.ts, zod, ai.
- `components/nodes/reference-node.tsx`: clip preview, path label, one video output handle. Depends on BaseNode, TypedHandle, MediaSlot, toFlowStatus (lib/flow-status.ts), the store.
- `lib/clip-drop.ts`: orchestrates sample into analyze into layout into load, and, from task 10, the staggered reveal.
- store / canvas / toolbar: `loadGraph`, the drop target and overlay, the "reference" node type, the "Choose clip" button.

`reference-node.tsx` follows `tts-node.tsx`'s conversion, the only node component built from kit pieces so far: `BaseNode` for the shell, error banner and Run button, `TypedHandle` for the single video source handle, `MediaSlot` for the clip preview, `toFlowStatus` to bridge `NodeStatus` into the kit's `FlowStatus`. `MediaSlot`'s real props: `kind: "image" | "video" | "audio" | "text"`, `status: FlowStatus`, `src?`, `alt?`, `emptyText?`, `aspect?: "video" | "square" | "auto"`, `className?`, `children?`; this build renders `kind="video"` with `src={data.clipUrl}`. `node-status.tsx` exports `NodeStatusBadge` (`status: FlowStatus`, `compact?: boolean`, `aria-live="polite"`) and `statusRingClass(status)`, but no node component, `tts-node.tsx` included, renders it today; status shows through `BaseNode`'s own ring and error banner, so `reference-node.tsx` has no reason to be first.

### Data types and schemas
```ts
// lib/types.ts (extended)
export type NodeKind = "image" | "video" | "tts" | "composition" | "cluster" | "reference";
// "cluster" already landed with build 07; this build adds "reference".

export interface ReferenceNodeData extends BaseNodeData {
  clipUrl?: string;               // object URL, or a Blob URL if BLOB_READ_WRITE_TOKEN is set
  clipMissing?: boolean;          // true after a reload with no Blob upload
  frames: { t: number; dataUrl: string }[];
  duration: number;
  hasAudio: boolean | "unknown";
  summary?: string;               // "1 shot, push-in, dusk"
  path?: "first pass" | "repaired" | "fallback";
}

export type FlowNode =
  | Node<ImageNodeData, "image">
  | Node<VideoNodeData, "video">
  | Node<TTSNodeData, "tts">
  | Node<CompositionNodeData, "composition">
  | Node<ClusterNodeData, "cluster">
  | Node<ReferenceNodeData, "reference">;
```

```ts
// lib/flow-doc.ts
export const FlowDocNodeSchema = z.object({
  id: z.string(),
  kind: z.string(),               // checked against a fixed allow list by validateGraph, not here
  data: z.object({
    prompt: z.string().optional(),
    model: z.string().optional(),
    duration: z.number().optional(),
  }).passthrough(),
});

export const FlowDocEdgeSchema = z.object({
  source: z.string(),
  sourceHandle: z.string(),       // `${nodeId}:${handleType}`, F2's grammar
  target: z.string(),
  targetHandle: z.string(),
});

export const FlowDocSchema = z.object({
  version: z.literal(1),
  nodes: z.array(FlowDocNodeSchema),
  edges: z.array(FlowDocEdgeSchema),
});
export type FlowDoc = z.infer<typeof FlowDocSchema>;
```

`NODE_HANDLES` has two sources depending on whether the registry landed first. Preferred, once `lib/node-kinds.ts` exists: derive it from `NODE_KINDS`, mapping each kind's `PortSpec[]` down to its handle types. Fallback, written by hand:
```ts
export const NODE_HANDLES: Record<string, { in: HandleType[]; out: HandleType[] }> = {
  image: { in: ["text", "image"], out: ["image"] },
  video: { in: ["text", "image"], out: ["video"] },
  tts: { in: ["text"], out: ["audio"] },
  composition: { in: ["video", "audio"], out: [] },
};
```
Either way, `validateGraph`'s "unknown kind" check tests a fixed four-kind list (image, video, tts, composition), never membership in `NODE_HANDLES` or `NODE_KINDS` directly, since both may also list `cluster` and `reference` once the registry covers the whole app.

```ts
export function validateGraph(doc: FlowDoc): GraphError[];
export function layoutGraph(doc: FlowDoc, origin: { x: number; y: number }): Record<string, { x: number; y: number }>;
export function breakdownToGraph(breakdown: ClipBreakdown): FlowDoc; // video nodes default to VIDEO_MODELS[0].id
export function edgeIsValid(edge: FlowDocEdge, nodes: FlowDocNode[]): boolean; // [HAND]
```
`layoutGraph` returns a node-id-to-position map, never a FlowDoc with coordinates baked in. `loadGraph(doc, { origin })` calls it, assigns fresh node ids, and merges FlowNode/FlowEdge objects into the store rather than replacing it.

### Model contract
The route sends eight frames as image parts plus duration and hasAudio, asking `generateObject` for one ClipAnalysis: up to three shots in an existing shot vocabulary, and a graph using only the four kinds in NODE_HANDLES (given verbatim), image into video per shot, first video into composition, tts into composition's audio when audio is true or unknown.

```ts
const ShotBreakdownSchema = z.object({
  shotType: z.enum(["wide","medium","close_up","extreme_close_up","aerial","pov","tracking","insert","establishing","other"]),
  cameraAngle: z.string(),
  cameraMovement: z.string(),
  composition: z.string(),
  subject: z.string(),
  action: z.string(),
  emotionalIntent: z.string(),
  visualStyleNotes: z.string().optional(),
  imagePrompt: z.string(),
  videoPrompt: z.string(),
  durationEstimateSeconds: z.number(),
  tStart: z.number(),
  tEnd: z.number(),
});
const ClipAnalysisSchema = z.object({
  breakdown: z.object({
    summary: z.string(),          // "1 shot, push-in, dusk", written directly, not derived
    shots: z.array(ShotBreakdownSchema).min(1).max(3),
  }),
  graph: FlowDocSchema,
});
```
Repair: a `validateGraph` failure triggers one repair request with the plain-language errors, asking for a corrected graph only. Still invalid, `breakdownToGraph(breakdown)` runs locally, no more model calls, `path: "fallback"`. A first-request failure with no breakdown returns an error; the client offers an empty image-into-video skeleton instead. Stub mode returns the fixture untouched, `path: "first pass"`, `stub: true`.

### States and feedback
In order: the drop overlay; "sampling frames n/8" with thumbnails landing as they resolve; "reading the shot"; nodes appearing one by one, 150ms apart, skipped under prefers-reduced-motion; the summary line. Errors use `BaseNode`'s existing red error banner: unsupported file, a clip over 60s (offers the first 60s), analysis failed (offers the skeleton above).

### Accessibility and cross-browser notes
"Choose clip" opens a native file input into the same pipeline as a drop, a non-drag path. State changes post to an `aria-live="polite"` region by the reference node, the same pattern `node-status.tsx`'s `NodeStatusBadge` already uses for its own status text. Chrome fires `seeked` once a frame is paintable; Safari can fire it a tick early, so `sampleFrames` waits one `requestAnimationFrame` after `seeked` before drawing. No audio-track property is standardized on both engines; the build tries `audioTracks?.length` then `webkitAudioDecodedByteCount`, else `"unknown"`. Confirm which fires on Chrome and Safari during task 1. Verify all of this in a visible, rendering browser window; a hidden or background tab gives false React Flow results (edges missing after reload, Enter and Space appearing dead).

## 6. Changes to existing code
- `lib/types.ts`: `NodeKind` gains `"reference"`. `FlowNode` gains `Node<ReferenceNodeData, "reference">`. (`"cluster"` already landed with build 07.)
- `lib/store.ts`: `FlowState` gains `loadGraph`, added alongside `addNode`. Reference nodes skip `defaultData` entirely; only a clip drop or Choose clip constructs a `ReferenceNodeData` object directly.
- `components/flow-canvas.tsx`: `nodeTypes` gains `reference: ReferenceNode`, the same direct, hand-edited entry every kind gets today. If the views table (`NODE_VIEWS` in `components/nodes/registry.tsx`, a later registry slice in CONCEPT.md) has landed, the entry goes there instead. The wrapping div in `FlowCanvasInner` gains `onDragOver`/`onDrop` and the drop overlay, a sibling of `NodeToolbar` and `Header`.
- `components/node-toolbar.tsx`: a "Choose clip" button joins the button row, after the divider that separates the kind buttons from Run all, using the drop handler's pipeline. `NODE_BUTTONS` does not gain a "reference" entry; decision 4 keeps reference out of the generic add-node path.
- `lib/executor.ts` is not modified. `layoutGraph` (lib/flow-doc.ts) and the staggered reveal (lib/clip-drop.ts) reuse the same Kahn's-algorithm shape as `topologicalSort` here, for ordering only.
- If `lib/node-kinds.ts` exists by the time this build lands, `reference` also gets a `NODE_KINDS` entry for its ports, with `palette: false` so the derived toolbar does not offer it. Its data is always constructed by the drop pipeline, never through the generic add-node/`defaultData` flow an `initial` field would otherwise seed.

## 7. Testing
Unit-tested (Vitest, `lib/__tests__/flow-doc.test.ts`): `validateGraph` against a clean graph, an unknown kind, a `cluster` or `reference` kind arriving in a model-authored graph, a duplicate id, a missing-node edge, a handle mismatch, an edge out of composition, two edges into one input, a cycle. `layoutGraph` against a chain and a branch into one composition. `breakdownToGraph` against a 1-shot breakdown, the same with audio, and a 3-shot breakdown. `edgeIsValid`'s cases live in its hand task.

The suite runs under jsdom (`vitest.config.mts` sets `environment: "jsdom"` project-wide, with `./vitest.setup.ts` as `setupFiles`), which stubs `ResizeObserver`, `scrollIntoView` and the pointer-capture trio, and stops a jsdom-only spurious window `blur` that closes Radix menus early. None of that touches `flow-doc.test.ts`, which is pure functions with no rendering. Any component test written for `reference-node.tsx` runs under the same setup already exercising the kit pieces it imports (`media-slot.test.tsx`, `node-status.test.tsx`); no node component under `components/nodes/` has its own test file yet, `tts-node.tsx` included.

Checked by hand, in a visible Chrome and Safari window (a hidden or background tab gives false React Flow results): a clip under a minute; one over 60s; a non-video file; zero keys; a reload with no BLOB_READ_WRITE_TOKEN; Choose clip by keyboard; reduced motion on; existing nodes survive a drop untouched.

## 8. Risks and open questions
1. Unknown port on a known handle type: error or warning in `edgeIsValid`, the hand task's real decision. Default here, error.
2. Analysis can fail before any breakdown exists. Default: an empty image-into-video skeleton, path "fallback."
3. Stub runs always validate. Default: log entries carry `stub: boolean`; a measured validity rate should count only real runs.
4. Safari's audio detection may return "unknown" more often. Default: "unknown" counts as present.
5. The clip is a session-only object URL without BLOB_READ_WRITE_TOKEN. Default: keep the breakdown and graph; the clip element says "clip missing, drop it again."

## 9. Decisions made for you
1. Analysis is one combined `generateObject` call for breakdown and graph, not two, so a repair costs one extra round trip.
2. Per-shot fields copied from an existing shot vocabulary are required strings except visualStyleNotes. breakdown also carries a model-written `summary`, since deriving "push-in, dusk" from those fields would be fragile.
3. `FlowDocNode.kind` is a loose string at the zod layer; `validateGraph`, not the parser, rejects an unreal kind, against a fixed four-kind allow list (image, video, tts, composition) rather than against every kind `NODE_HANDLES` or `NODE_KINDS` happens to list, so a model-authored `cluster` or `reference` node is always invalid here even once the registry defines ports for both. `layoutGraph` returns only a position map, never a FlowDoc with coordinates baked in.
4. Reference nodes skip the toolbar's `addNode`/`defaultData` path; only a clip drop or Choose clip creates one. Their video output allows manual wiring; nothing wires it automatically.
5. "image", "video" and "audio" inputs are single-value everywhere (the executor only reads index 0); only text is multi-value. `validateGraph`'s multi-input check applies to non-text types.

## 10. Not verified
1. Whether `ai`'s `generateObject` (`^5.0.0`, installed) accepts a zod v4 schema (`zod` is `^4.4.2`, installed). No `generateObject` call exists anywhere in this repo yet to test it.
2. The AI Gateway model slug `LLM_MODEL` resolves to. `lib/models.ts`'s `DEFAULT_LLM_MODEL` guesses `"anthropic/claude-sonnet-5"`; nothing has called `generateObject` with it yet to confirm the gateway accepts that slug.
3. Whether `generateObject` accepts image parts (data URLs) for that model through the gateway.
4. Request body size for 8 data-URL frames at 512px, JPEG 0.7. Rough estimate 20 to 60KB per frame before base64, maybe 250 to 650KB total; not measured against any route's body limit. A failure here surfaces as the same "analysis failed" state as any other request failure.
