# Concept Cluster: build plan

Total 3.5 h · Thin slice (tasks 1-7) built on `claude/design-system-component-reuse-321c19` @ 296bafe · 80 min open across tasks 8-12

## Before you start
- Work on a branch cut from `claude/design-system-component-reuse-321c19` at or after 296bafe, or from `main` once PRs #2 to #5 are merged into it.
- Foundation F1-F4 and build 07 tasks 1-7 are already built (see Built below). Run `pnpm install && pnpm test` first: expect 10 files, 94 passed, 2 todo.
- `pnpm dev` runs clean; `pnpm typecheck` is clean before you start.
- Note which provider keys are set locally (`AI_GATEWAY_API_KEY`, `FAL_KEY`, and similar). The acceptance walkthrough below depends on stub mode, meaning none of them set.

## Built

| Task | Commit | Delivered | Verify (regression check) |
|---|---|---|---|
| 1. Types and store wiring | b6f09a5 | `cluster` in `NodeKind`/`FlowNode`; a `defaultData` entry; `cluster: ClusterNode` in `nodeTypes`; a toolbar button | `pnpm typecheck` clean; the toolbar button drops a node on the canvas |
| 2. Fixture | d77df03 | `lib/stubs/cluster.json` with a `sets` array, two sets, four groups each, one `wild` per set | import it, log the shape of both sets |
| 3-4. Cluster node on the fixture; pin and dynamic handles | 76e7dec | all four states render off the fixture; pin/unpin toggles `pinned`/`outputTexts`; a `TypedHandle` per pin; `useUpdateNodeInternals` after every change | add a cluster node, click Run, see the fixture's groups after the skeleton; pin a chip, drag a new edge from its handle to an existing node's text target, connection succeeds |
| 5. Executor integration, fixture-backed | 21bcb67 | the `RunResult` discriminated union; a `"cluster"` branch in `runNode`/`runSingleNode`, resolving the fixture with no fetch | Run all with a cluster node and a downstream node completes without error |
| 6-7. Branch action to image; Re-roll all | 1f64a90 | a pinned chip's "to image" wires a new Image node via `clearSpot` placement; "Re-roll all" replaces unpinned suggestions via `rerollGroups`/`nextStubGroups` | the new Image node appears already wired with the wire preview visible; pin one chip, wire it, re-roll all, the pinned chip and its edge are unchanged and everything else changed |

## Open tasks

**8. Branch action: to video.** 10 min.
Goal: same as the built "to image" action, for video nodes.
Files: `components/nodes/cluster-node.tsx`.
Steps: add a `branchToVideo` mirroring `branchToImage`, calling `addNode("video", spot)` and wiring the pin's port to the new node's text handle; render it next to "to image" using the same hand-rolled `<button>` and Tailwind pattern already in the file (it imports nothing from `components/ui` or `components/flow` today; this task should not be the first to add one).
Verify: same as task 6, on a Video node.

**9. Re-roll one group.** 10 min.
Goal: a per-group control.
Files: `components/nodes/cluster-node.tsx`; `lib/cluster.ts` if the merge needs a group-scoped entry point.
Steps: replace only that group's unpinned suggestions, reusing `rerollGroups`'s pin-preserving behavior scoped to one group id; add a small icon button per group header matching the existing "Re-roll all" footer button's markup.
Verify: re-roll one group; the other groups and all pins stay as they were.

**10. Real LLM route.** 40 min.
Goal: replace the executor's fixture shortcut with the actual model call.
Files: `app/api/generate/cluster/route.ts` (new); `lib/executor.ts`.
Steps: `generateObject({ model: LLM_MODEL, schema: ClusterResponse, ... })`; retry once on a schema failure, `{ error }` at 500 on a second; when `hasLlmKey()` is false, serve the fixture's next set through the same rotation `nextStubGroups` already does, so today's behavior does not regress; assign ids server-side with `assignIds` after the schema check; point the executor's `"cluster"` branch at this route instead of calling `nextStubGroups` directly.
This is the app's first `generateObject` call: the schema-mismatch error shape, the AI Gateway slug, and zod 4 against `ai@^5` are all unverified until it runs (spec.md, Risks). Under Nick's 2026-09-20 build order this task runs before the registry, so the fetch goes into the executor's `"cluster"` branch and registry slice 3 moves it into `RUNNERS.cluster`. Settle the `ai` version before writing it: `^5.0.0` is installed and current AI Gateway guidance targets `^6`, so one upgrade before the first `generateObject` call keeps this route and build 11's on one API (HANDOFF.md, Next).
Verify: with no `AI_GATEWAY_API_KEY` set, Run still returns the fixture, through the real request path, not the executor shortcut.

**11. Cross-browser pass.** 10 min.
Goal: confirm the interaction model in both browsers that matter.
Files: none, verification only.
Steps: in Chrome and Safari, tab through a cluster node's chips, confirm focus is visible and Enter or Space toggles a pin; confirm a pinned handle connects in both. Use a visible, foregrounded window: a hidden or background tab can under-report React Flow edges and make Enter/Space look dead even when the page works.
Verify: same behavior in both; note any difference. Safari is unverified for build 07 as of 2026-09-20.

**12. [HAND] Finish effectivePrompt.** 10 min. Nick's, no agent.
Goal: replace `lib/prompt.ts`'s provisional "both present" behavior with a real decision.
Files: `lib/prompt.ts`, `lib/__tests__/prompt.test.ts`.
The open question: when a wired text and the node's own prompt both exist, does the wire prefix, suffix or replace it, and what joins them. Four of the five cases in `prompt.test.ts` already pass against the provisional default (own prompt first, space-joined); the fifth is `it.todo(...)`, marked `[HAND]`, and should stay that way for anyone but Nick.
Worth weighing: `gatherInputs` pushes one string per incoming text edge with no de-duplication by target handle, so a single text target that receives more than one wire already produces a `wired` array longer than one entry, whatever the two-part join ends up being.
Verify: `pnpm test` green.

## Cut line
If time runs short on what is open: drop task 8 (to video; keep to image only), then task 9 (per-group re-roll; keep re-roll all), then task 10 (stay on the fixture and say so in the node's stub label), then task 11's Safari half (verify Chrome only and note the gap). Tasks 1-7 are already built and are not on this list: pin becomes a wire, one branch action, and the wire surviving a re-roll are the point of the thin slice.

## Acceptance walkthrough (stub mode, zero keys)
Setup: a cluster node on the canvas, already run once so four groups show, nothing pinned, empty space to its right.
1. Look at the node. One group carries the "surprising" tag next to its axis label.
2. Click a chip in that group to pin it. A handle appears beside it.
3. Click "to image." An Image node appears to the right, already wired, showing the "prompt from wire" preview.
4. Click "Re-roll all." Unpinned chips reshuffle; the pinned chip and the Image node's wire stay put.
5. Click "Run all." The Image node resolves in stub mode, using the pinned concept as its prompt, with zero keys set.
