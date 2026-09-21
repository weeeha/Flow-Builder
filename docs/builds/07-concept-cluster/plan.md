# Concept Cluster: build plan

Total 3.5 h · Tasks 1-10 built (1-7 on `claude/design-system-component-reuse-321c19` @ 296bafe, 8-10 on `cluster-finish`) · open: task 11's Safari half, task 12 [HAND]

## Before you start
- Work on a branch cut from `claude/design-system-component-reuse-321c19` at or after 296bafe, or from `main` once PRs #2 to #5 are merged into it.
- Foundation F1-F4 and build 07 tasks 1-10 are already built (see Built below). Run `pnpm install && pnpm test` first: expect 13 files, 114 passed, 2 todo.
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
| 8-9. To video; re-roll one group | b71f6f9 | `branchFromPin` in `lib/branch.ts` for both branch kinds; `rerollGroup` and `rerollClusterGroup`; a to-video button beside to-image and a shuffle button per group header; only the re-rolled group shows the skeleton | pin a chip, click to video, a wired Video node appears with the wire preview; re-roll one group, the other groups and every pin stay |
| 10. Real LLM route | 596ce20 | `app/api/generate/cluster/route.ts` on `ai` ^7 (`generateText` + `Output.object`, one retry on a schema failure, fixture rotation without a key); the executor posts to it for Run, Run all and the per-group re-roll | with no key, Run returns the fixture through the request path; `curl` the route twice with the first answer's groups, the set rotates |

## Open tasks

Tasks 8, 9 and 10 are built (see Built above).

**11. Cross-browser pass.** Chrome half done 2026-09-20, Safari half open.
Goal: confirm the interaction model in both browsers that matter.
Files: `scripts/check-cluster-chrome.mjs` (run, 14/14) and `scripts/check-cluster-safari.mjs` (not yet run); verification only.
Steps: with `pnpm dev` up, turn on Safari > Settings > Developer > Allow remote automation, start `safaridriver -p 4445`, run `node scripts/check-cluster-safari.mjs`. The script tabs to a chip and checks `:focus-visible`, toggles a pin with Enter and Space, drags a pinned handle onto a video node's text input, clicks to video and re-rolls one group, then writes a screenshot. The built-in Browser pane is no substitute: its synthetic Enter and Space do not fire default clicks.
Verify: 14/14 in Safari; note any difference from Chrome.

**12. [HAND] Finish effectivePrompt.** 10 min. Nick's, no agent.
Goal: replace `lib/prompt.ts`'s provisional "both present" behavior with a real decision.
Files: `lib/prompt.ts`, `lib/__tests__/prompt.test.ts`.
The open question: when a wired text and the node's own prompt both exist, does the wire prefix, suffix or replace it, and what joins them. Four of the five cases in `prompt.test.ts` already pass against the provisional default (own prompt first, space-joined); the fifth is `it.todo(...)`, marked `[HAND]`, and should stay that way for anyone but Nick.
Worth weighing: `gatherInputs` pushes one string per incoming text edge with no de-duplication by target handle, so a single text target that receives more than one wire already produces a `wired` array longer than one entry, whatever the two-part join ends up being.
Verify: `pnpm test` green.

## Cut line
Only task 11's Safari half and task 12 remain. The Safari half blocks nothing else and can wait for a session with Safari's remote automation switched on.

## Acceptance walkthrough (stub mode, zero keys)
Setup: a cluster node on the canvas, already run once so four groups show, nothing pinned, empty space to its right.
1. Look at the node. One group carries the "surprising" tag next to its axis label.
2. Click a chip in that group to pin it. A handle appears beside it.
3. Click "to image." An Image node appears to the right, already wired, showing the "prompt from wire" preview.
4. Click "Re-roll all." Unpinned chips reshuffle; the pinned chip and the Image node's wire stay put.
5. Click "Run all." The Image node resolves in stub mode, using the pinned concept as its prompt, with zero keys set.
