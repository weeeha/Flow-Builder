# Concept Cluster node

Status: refreshed 2026-09-20 from the 2026-09-19 draft · Base: claude/design-system-component-reuse-321c19 @ 296bafe · Thin slice built, 80 min of tasks open

## 1. TL;DR
Concept Cluster is a node kind that fans one loose prompt into three or four grouped suggestions, a pattern taken from Runway's Concept Cluster. Pinning a suggestion turns it into a text output wired to another node; re-rolling reshuffles everything except what is pinned. It runs with zero API keys, against a local fixture, the same stub pattern every generation route in this app already uses. The thin slice (tasks 1-7) is built; 80 minutes of tasks remain (8-12), one of them Nick's by hand.

## 2. Changes since the 2026-09-19 draft
- Foundation (F1-F4) and build 07 tasks 1-7 are built on `claude/design-system-component-reuse-321c19`; only tasks 8-12 remain.
- The zod schema moved into its own file, `lib/cluster-schema.ts`, apart from the pure helpers in `lib/cluster.ts`, so the client bundle does not pull in zod.
- The fixture (`lib/stubs/cluster.json`) is `{ sets: [{ groups }, ...] }`, not the single `{ groups }` the original draft described. Two sets exist so a stub re-roll has something to swap to; `lib/cluster.ts` picks the next one with `nextStubSetIndex`.
- `lib/cluster.ts` also grew a `clearSpot` collision-avoidance helper for where a branched node lands, beyond what the original architecture list named.
- The executor's `RunResult` carries a `stub: boolean` alongside `groups`, so a roll's fixture-vs-real state reaches `data.stub`.
- `DEFAULT_LLM_MODEL` and `llmModelLabel` live in `lib/models.ts`, not `lib/llm.ts`, because `lib/llm.ts` is `server-only` and the card header needs the label on the client.
- `BaseNode` gained an optional `runDisabled` prop, though the original decision 5 said BaseNode would not change. Flagged below for Nick.
- CONCEPT.md (2026-09-20) proposed a node registry; it is not a prerequisite for tasks 8-12 (see Architecture). Nick's build order of 2026-09-20 puts tasks 8 to 11 before the registry, so task 10 adds its fetch to the executor's `"cluster"` branch and registry slice 3 moves it into `RUNNERS.cluster` later.

## 3. What the user sees
1. Add a Cluster node from the toolbar. Empty, placeholder copy, no groups.
2. Type a loose prompt, for example "a lighthouse at dusk," press Run.
3. Skeleton chips show while loading, then labeled rows (axis: camera, era, weather, material). One row is flagged deliberately surprising.
4. Click a chip to pin it. A small text handle appears beside it.
5. Click the pinned chip's "to image" action. A new Image node appears to the right, already wired, with a "prompt from wire" preview.
6. Click "Re-roll all." Unpinned chips reshuffle; the pinned chip and the Image node's wire don't move.
7. Click "Run all." The Image node resolves using the pinned concept, in stub mode, no key set.

## 4. Scope
**In v1:** all four states; chips from a real LLM route with a zod-checked schema and one retry; pin/unpin with a dynamic port per pin, up to four; "to image" and "to video" branch actions; re-roll all and re-roll one group; `runAll` includes cluster nodes.

**Thin slice, built:** the local fixture stands in for the route. All four states, chips, pin/unpin with the dynamic port, one branch action ("to image"), re-roll all only. `runAll` already includes cluster nodes: it walks every node in topological order and `runNode` branches on `node.type`, with a `"cluster"` branch that resolves the fixture.

**Out of v1:** "more like this" on a suggestion, per-suggestion thumbnails, dragging a chip onto canvas without picking a type, saving clusters.

## 5. Design

### Architecture
- `lib/types.ts`: `ClusterNodeData`, `ClusterGroup`, `PinnedSuggestion`; `"cluster"` in `NodeKind` and `FlowNode`. Built.
- `lib/cluster-schema.ts`: the zod schema (`ClusterResponse`), kept apart from `lib/cluster.ts` so the client bundle does not pull in zod. Built.
- `lib/cluster.ts`: the pure helpers - `assignIds`, `togglePin`, `toOutputTexts`, `rerollGroups`, `clearSpot`, `nextStubSetIndex`/`nextStubGroups`. Built, wider than the original list, which only named the schema and the route.
- `lib/stubs/cluster.json`: the no-key fixture, `{ sets: [{ groups: RawClusterGroup[] }, ...] }`, two sets. Built.
- `app/api/generate/cluster/route.ts`: the LLM call, a `POST` handler returning `{ groups }` or `{ error }`. Depends on `lib/llm.ts`, zod, `ai`, the fixture. Still open (task 10).
- `components/nodes/cluster-node.tsx`: the UI. Depends on `BaseNode`, `TypedHandle` (`components/handles/typed-handle.tsx`), `useFlowStore`, `useUpdateNodeInternals`. Built; uses hand-rolled buttons and Tailwind classes throughout, nothing from `components/ui` or `components/flow`.
- `lib/executor.ts`: a `"cluster"` branch in `runNode`/`runSingleNode`. Built; today it resolves the fixture on a timer, no fetch. Task 10 points it at the route.
- store / canvas / toolbar: `defaultData`'s cluster entry, `nodeTypes`'s `cluster: ClusterNode`, the toolbar's `NODE_BUTTONS` entry. Built.

Interplay with the node registry: CONCEPT.md (2026-09-20) proposes a `NODE_KINDS`/`RUNNERS`/`NODE_VIEWS` registry, but nothing in tasks 8-12 needs it to exist first. Under the registry, the cluster kind's `outputs` is a function of `data.pinned`, and the card keeps rendering its own per-pin handles as it does now. If the registry's runners slice lands before task 10, the fetch to `/api/generate/cluster` belongs in `RUNNERS.cluster` and the `"cluster"` branch in `lib/executor.ts` goes away; if it lands after, task 10 adds the fetch where the branch already is, and a later pass moves it. Either order works for the tasks below.

### Data types
```ts
export interface ClusterGroup {
  id: string;
  axis: string;
  wild?: boolean;
  suggestions: { id: string; text: string }[];
}

export interface PinnedSuggestion {
  id: string;
  text: string;
  axis: string;
}

export interface ClusterNodeData extends BaseNodeData {
  prompt: string;
  groups: ClusterGroup[];
  pinned: PinnedSuggestion[];
  outputTexts: Record<string, string>;
  stub?: boolean;
}
```
Unchanged from the draft. `model` stays unset on `ClusterNodeData`; the header label comes from `llmModelLabel(DEFAULT_LLM_MODEL)` in `lib/models.ts`, not a per-node picker. That constant sits in `lib/models.ts` rather than the server-only `lib/llm.ts`, because the card header needs it on the client.

### Model contract
```ts
export const ClusterResponse = z
  .object({ groups: z.array(Group).min(3).max(4) })
  .refine((r) => r.groups.filter((g) => g.wild).length === 1, "exactly one wild group");
```
(`Suggestion` and `Group` keep the shape the draft specified: suggestions capped at 25 words, groups of exactly three, three or four groups total.) Ids are assigned by `assignIds` in `lib/cluster.ts`, after the schema check, never by the model. The schema is built and unit-tested against fixture-shaped objects. The route that calls it through `generateObject`, retries once on failure, and returns `{ error }` at 500 on a second failure is task 10, still open; nothing exercises that retry path yet.

### States and feedback
- Empty: placeholder copy; Run stays disabled until there is a prompt or a wired seed. Built.
- Running: skeleton chip rows. A pinned chip stays mounted and interactive through a run rather than turning into a skeleton, so its handle and wire never disappear mid-roll. Built.
- Error: BaseNode's existing red banner. Built, unchanged.
- Stub: fixture groups render normally with a "stub" tag composed into BaseNode's `modelLabel` slot. Built.
- Pins: filled chips with a pin icon and a handle; a re-roll never overwrites a pinned suggestion's id or text. Built.

### Accessibility and cross-browser notes
- Chips are real `<button>` elements with `aria-pressed`, reachable by Tab, toggled by Enter or Space. Built from task 3 onward, not deferred.
- Branch actions carry an `aria-label` naming the axis. Built.
- A `:focus-visible` ring was added for the chips, since nothing else in the app had one yet. Built.
- Every pin, unpin, and re-roll calls `useUpdateNodeInternals` so React Flow re-measures the node's handles. Built; this answers the original draft's open question about needing that call, but only by implementation, not by an automated test.
- The cross-browser pass (task 11) is still open. Safari has not been checked for build 07 as of 2026-09-20.

## 6. Changes to existing code

### Built
- `lib/types.ts`: `NodeKind` gains `"cluster"`; `FlowNode` gains `Node<ClusterNodeData, "cluster">`; the three cluster interfaces added. `BaseNodeData` already carried `outputText`/`outputTexts` from the foundation.
- `lib/store.ts`: `defaultData` gains a `cluster` entry: `{ status: "idle", prompt: "", groups: [], pinned: [], outputTexts: {} }`.
- `components/flow-canvas.tsx`: `nodeTypes` gains `cluster: ClusterNode`.
- `components/node-toolbar.tsx`: `NODE_BUTTONS` gains a "Concept Cluster" entry.
- `lib/executor.ts`: `RunResult` is now `{ kind: "url"; url: string } | { kind: "cluster"; groups: ClusterGroup[]; stub: boolean }`; `runNode` gains a `"cluster"` branch; `runSingleNode` branches on `result.kind` and re-reads the node's current `pinned` state before merging a roll, since a pin can land while the roll is in flight.
- `components/nodes/base-node.tsx`: gained an optional `runDisabled` prop (default `false`), used only by the cluster card. The original decision 5 said BaseNode would not be modified; this is small and backward-compatible, every other card omits the prop and keeps its old behavior, but it is still a deviation. See Decisions.

### Still to change
- `components/nodes/cluster-node.tsx`: a "to video" branch action mirroring "to image" (task 8); a per-group re-roll control mirroring "Re-roll all" (task 9). Both should match the file's existing hand-rolled markup; it imports nothing from `components/ui` or `components/flow` today.
- `app/api/generate/cluster/route.ts`: does not exist yet (task 10). The executor's `"cluster"` branch will point at it instead of calling `nextStubGroups` directly.
- No further change to `components/handles/typed-handle.tsx` beyond the foundation's refactor, already in place.

## 7. Testing
Unit-tested (Vitest, `lib/__tests__/`): the zod schema against right and wrong shapes (wild-group count, a 26-word suggestion, group count); the fixture itself (at least two sets, four groups per set with one wild, matching axes across sets, no repeated suggestion text); `assignIds`, `togglePin` (including the four-pin cap and no-mutation), `toOutputTexts`, `rerollGroups` (a pinned row survives, ids stay stable, a shorter fresh roll doesn't drop a pin), `clearSpot`, `nextStubSetIndex`. This is more automated coverage than the original draft planned; it expected only the schema to be unit-tested and the rest checked by hand.

Checked by hand, not yet automated: pin/unpin state in Chrome and Safari (task 11 covers the Safari half); the running skeleton; the stub label; a branch action creating a correctly wired node; keyboard-only pinning; `runAll` completing end to end with zero keys set.

Fixture: `lib/stubs/cluster.json`, used when `hasLlmKey()` is false, covered by its own tests above. Not yet exercised through a real route, since none exists.

`pnpm test` on this base: 10 files, 94 passed, 2 todo. One of the two todo cases is `effectivePrompt`'s task-12 case; the other sits in `lib/__tests__/flow-status.test.ts`.

## 8. Risks and open questions

**Closed by the build** (open questions in the 2026-09-19 draft):
1. Text doubling, if `runNode` sent both the folded prompt and the original `inputs.texts`: closed. The POST body sends `inputs: { ...inputs, texts: [] }` after folding into `data.prompt`; the cluster branch sends no `inputs.texts` at all.
2. Whether React Flow needs an explicit call when a node's handles change at runtime: closed by implementation. `cluster-node.tsx` calls `useUpdateNodeInternals` after every pin, unpin, and re-roll. Not closed by an automated test; task 11 still covers the manual check.
3. `runNode`'s return type for a cluster run: closed. `RunResult` is a discriminated union.
4. Trusting the model for stable ids: the mitigation is closed. `assignIds` assigns ids after the schema check regardless of source, and it is unit-tested.

**Not verified:**
- The exact error `generateObject` throws on a schema mismatch, needed for task 10's retry logic, and whether `ai@^5` routes a plain string model id through the AI Gateway once a key is set. `lib/llm.ts` carries a comment asserting the gateway resolves a plain string id, but nothing calls `generateObject` yet.
- The AI Gateway slug for Claude Sonnet 5 (`"anthropic/claude-sonnet-5"` in `lib/models.ts` is a guess at the shape).
- zod `^4.4.2` against `ai@^5`'s `generateObject` schema argument, same reason.
- Whether one text target in `@xyflow/react` 12 accepts more than one incoming edge through ordinary dragging. The data layer already allows it: `gatherInputs` pushes one string per incoming text edge with no de-duplication by target handle, so `inputs.texts` can already exceed length 1 if such a connection exists. Whether the UI lets someone create one by hand is the open part, and task 12 needs an answer.
- Whether `BaseNode`'s new `runDisabled` prop should stay cluster-only, extend to other cards, or be replaced with something else.

## 9. Decisions
1. Handle grammar: `${nodeId}:${handleType}` or `${nodeId}:${handleType}:${port}`; ports never affect type checking. Built.
2. Pinning copies the suggestion's text rather than referencing it live, so a pinned wire survives a re-roll. Built.
3. Up to four pins per cluster, matching the four-groups cap (`MAX_PINS`). Built.
4. Branch actions position the new node to the right and wire it immediately, no confirmation step. Built, with collision avoidance (`clearSpot`) rather than a fixed offset.
5. The stub label composes into BaseNode's `modelLabel` slot. Built. This decision also said BaseNode would not otherwise change; it has since gained an unrelated, optional `runDisabled` prop, cluster-only today. Default until Nick says otherwise: leave it, since it is additive and every other card is unaffected.
6. On schema failure, one retry, then the existing error banner; no fallback to the fixture once a real key exists. Not yet built (task 10).
7. (2026-09-20) Params stay split hybrid across the app: the cluster card keeps prompt, groups, pins and Re-roll all; the inspector gets nothing for this kind. No inspector work sits on the path to finishing tasks 8-12.
