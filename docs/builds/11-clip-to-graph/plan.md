# Clip to graph: build plan

Refreshed 2026-09-20 from the 2026-09-19 draft, nothing built yet · Total 5 h, thin slice at task 8 (about 3 h) · Foundation and build 07's thin slice already built on this line · LLM cost only

## Before you start
- Foundation F1 to F4 are built and confirmed on this line: `parseHandleId` in lib/handles.ts, `effectivePrompt` in lib/prompt.ts, `gatherInputs` in lib/executor.ts bucketing by handle type, `LLM_MODEL` and `hasLlmKey()` in lib/llm.ts. `pnpm test`: 10 files, 94 passed, 2 todo, as of 2026-09-20.
- Nick's build order of 2026-09-20 lands registry slices 1 to 3 (kinds, inspector, runners and views) before this build: task 2 imports `NODE_HANDLES` from `NODE_KINDS`, `reference` registers through the three tables with `palette: false`, and task 7's `nodeTypes` entry goes into `NODE_VIEWS`. The fallback in the next sentence applies only if that order changes.
- Registry slice 1 (`lib/node-kinds.ts`, about 1 h, spec'd in CONCEPT.md) is the preferred prerequisite: land it first so task 2 imports `NODE_HANDLES` from `NODE_KINDS` instead of writing it by hand, and so `reference` gets one `NODE_KINDS` entry instead of touching files by hand. Fallback: if it has not landed, task 2 writes `NODE_HANDLES` by hand exactly as spec.md shows, and the registry absorbs it later. Task numbers stay 1 to 12 either way.
- Build 07's thin slice (tasks 1 to 7) is built on this line; its task 10 (a real `/api/generate/cluster` route) is not, and shares this build's `hasLlmKey()` plus `lib/stubs/` pattern.
- Work on a task branch cut from `claude/design-system-component-reuse-321c19` at or after 296bafe, or from `main` once PRs #2 to #5 are merged into it.
- `pnpm dev` and `pnpm typecheck` clean.
- Note whether AI_GATEWAY_API_KEY and BLOB_READ_WRITE_TOKEN are set; the thin slice, and the full build's zero-key rule, both need stub mode with neither.

## Tasks

All twelve built 2026-09-23 on `clip-to-graph`, PR #6. Browser checks: `scripts/check-clip-drop-chrome.mjs` (21/21) and `scripts/check-clip-errors-chrome.mjs` (10/10). Deviations are listed at the top of spec.md.

**1. Frame sampling.** 25 min. lib/frames.ts.
`sampleFrames(file, n=8)`: hidden `<video>`, seek to n evenly spaced timestamps (first and last included), draw to a 512px canvas at JPEG 0.7, one rAF after `seeked`; audio guess via `audioTracks?.length` then `webkitAudioDecodedByteCount`, else `"unknown"`.
Verify: log the array for a real clip in a visible browser window, 8 plausible entries (a hidden or background tab fakes `seeked` timing).

**2. FlowDoc schema and layout.** 25 min. lib/flow-doc.ts.
`FlowDocNodeSchema`, `FlowDocEdgeSchema`, `FlowDocSchema`, `NODE_HANDLES` (from `lib/node-kinds.ts` if it exists, else written by hand here), `GraphError`, `layoutGraph` (columns by topological depth, x = depth × 320, y = index × 220).
Verify: `pnpm typecheck` clean; `layoutGraph` on a hand-built 3-node chain returns increasing x.

**3. [HAND] edgeIsValid.** 15 min. lib/flow-doc.ts, lib/__tests__/flow-doc.test.ts.
The 5 to 10 line predicate at the center of the type contract, written by you, no agent. Open question: an unknown port on a known type, error or warning.

Handle table: image (in text, image / out image), video (in text, image / out video), tts (in text / out audio), composition (in video, audio / out none).

Test cases to make pass:
- image's image output → video's image input → `true`
- video's video output → composition's video input → `true`
- tts's audio output → video's text input → `false` (type mismatch)
- edge to a missing target node → `false`
- composition as a source, it has no outputs → `false`
- your call: `"video-1:image:0"` when video-1 has no named ports, write this one last.
Verify: `pnpm test` green.

**4. validateGraph and breakdownToGraph.** 25 min. lib/flow-doc.ts.
`validateGraph`: an unknown kind (checked against the fixed four-kind list, not against everything `NODE_HANDLES` might contain once it derives from the full registry), duplicate id, `edgeIsValid` plus missing-node and composition-source checks, one incoming edge max per non-text input, cycles (same shape as `topologicalSort` in lib/executor.ts, reused for ordering only). `breakdownToGraph`: the fixed template, image into video per shot (capped at 3), first shot's video into composition, tts into audio when audio is true or unknown, default video model.
Verify: `pnpm test` green on spec.md's data-type fixtures.

**5. Stub fixture and the analyze route, stub path.** 25 min. lib/stubs/clip-analysis.json, app/api/analyze/clip/route.ts.
A complete, valid ClipAnalysis fixture; when `hasLlmKey()` is false, the route returns it with `path: "first pass"`, `stub: true`. The first route on this line to branch on `hasLlmKey()` inside a route handler, alongside build 07 task 10's `/api/generate/cluster`.
Verify: `curl localhost:3000/api/analyze/clip` with a minimal body returns the fixture.

**6. loadGraph.** 15 min. lib/store.ts.
New action: calls `layoutGraph`, assigns fresh ids per node, remaps edges, appends to `nodes`/`edges` rather than replacing them. The persisted store has no `version` or `migrate`, so `loadGraph` must not change the shape of existing node `data`.
Verify: call it twice against the same doc; two copies land, nothing lost.

**7. Reference node, minimal.** 20 min. components/nodes/reference-node.tsx, lib/types.ts, components/flow-canvas.tsx (`nodeTypes` entry).
`ReferenceNodeData`, the node type, `BaseNode` plus one `TypedHandle` video source, a `MediaSlot` (`kind="video"`) for the clip preview, `toFlowStatus` for status, following the `tts-node.tsx` conversion pattern. No prompt, model or other field yet, matching the hybrid-params decision. Frame strip and path label come in task 11.
Verify: construct one with a hardcoded clipUrl, it renders.

**8. Drop target and end-to-end wiring.** 30 min. components/flow-canvas.tsx. The toolbar stays untouched until task 12.
`onDragOver`/`onDrop` on the wrapper div, a full-canvas overlay while dragging, `screenToFlowPosition` for the drop point; on drop, create the reference node, call `sampleFrames`, POST to the analyze route, `loadGraph` the result.
Verify: zero keys, drag a short clip onto the canvas in a visible window; a reference node and a small graph appear.

**Thin slice stops here, about 3 h.** Drop a clip, sample frames, land a stub-backed graph next to a reference node, Run all completes with zero keys. No repair, fallback, stagger, or validity log yet.

**9. Repair loop and fallback.** 45 min. app/api/analyze/clip/route.ts.
Real branch calls `generateObject` per spec.md's model contract; `validateGraph` errors trigger one repair call with the plain-language errors; a second failure runs `breakdownToGraph(breakdown)` locally, `path: "fallback"`; `path: "repaired"` when the repair passes.
Verify: force `validateGraph` to fail once locally, confirm the repair call fires and the label reflects it.

**10. Staggered reveal.** 20 min. lib/clip-drop.ts (new), components/flow-canvas.tsx.
Pull task 8's `loadGraph` call into `lib/clip-drop.ts`; after layout, insert nodes and edges in topological order 150ms apart; skip the stagger under `prefers-reduced-motion`.
Verify: drop a 3-shot clip, nodes land one at a time; toggle reduced motion, they land together.

**11. Frame strip, summary, path label, validity log.** 25 min. components/nodes/reference-node.tsx, lib/clip-log.ts.
Thumbnail strip filling in as `sampleFrames` resolves each frame, "sampling frames n/8"; summary and path label on response; `lib/clip-log.ts` records `{ path, stub }` per run to localStorage.
Verify: drop a clip, thumbnails fill before the summary appears; check localStorage for the new entry.

**12. Choose clip, error states, cross-browser pass.** 30 min. components/node-toolbar.tsx, lib/clip-drop.ts, components/nodes/reference-node.tsx.
"Choose clip" opens a native file input into task 8's pipeline; unsupported-file and >60s (offer the first 60s) checks before sampling; analysis-failed offers spec.md's skeleton.
Verify, in visible Chrome and Safari windows: Choose clip works by keyboard; a >60s clip offers the trim; a non-video file shows the banner; existing nodes survive a drop untouched.

## Cut line
Drop in this order: task 12's Safari half (Chrome only), the log in task 11 (keep the strip, skip counting), task 10's stagger (nodes land at once), task 9's repair call (fallback still fires). Keep tasks 1, 4 and 8: real sampling, a real validateGraph, a clip landing a graph, the whole point.

## Acceptance walkthrough (stub mode, zero keys)
Before starting: a normal canvas, an unrelated node off to the side.

1. Drag a short clip in from Finder. The drop overlay appears.
2. Drop it. A reference node appears at the cursor, empty frame strip.
3. Thumbnails fill in, 0/8 through 8/8.
4. Status flips to "reading the shot."
5. An image node appears, then a video node, an edge between them; a composition node appears with an edge from the video.
6. The reference node settles: "1 shot, push-in, dusk · first pass."
7. Click Run all. Nodes resolve on stub assets; the unrelated node has not moved.

Thin-slice version (tasks 1 to 8 only): there is no frame strip, stagger or path label yet.
1. Drag and drop; the reference node appears with the clip playing.
2. The image, video and composition nodes land together, already wired.
3. Run all; the unrelated node did not move.
