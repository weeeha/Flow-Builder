# Handoff · Flow Builder · 2026-09-20 20:06 EDT
Branch: claude/flow-node-builder-handoff-061dc6 · PR: https://github.com/weeeha/Flow-Builder/pull/1 (merged, docs only) · Preview: none (no dev server for this repo was running at 18:52)

## Goal
Finish the three builds Nick picked for Flow Builder (00 foundation, 07 Concept Cluster, 11 Clip to graph) and add the inspector and node registry from CONCEPT.md. This file sequences all four.

## Done (this session)
- CONCEPT.md: levels, Nick's decisions, the recommended registry contract · f875138, 6ef02ff
- PR #1 merged into `origin/main`: CONCEPT.md and HANDOFF.md only, from a docs-only branch built on the GitHub stub
- This revision adds the picked builds and their order · this commit. The copy on `origin/main` is one revision behind.
- No app code changed in this session.

## State right now
- Picked builds (plans live outside the repo in `~/ClaudeCode Projects/Runaway/builds/`; shared contracts in its `README.md`):
  - **00 foundation** (`00-flow-builder-foundation/foundation.md`): built. F1 to F4 are c3d20ce, 7dc7497, 85341bf, 88290b2.
  - **07 Concept Cluster** (`07-concept-cluster/spec.md`, `plan.md`): thin slice built, tasks 1 to 7, tip ead6e47. Open: 8 to video, 9 re-roll one group, 10 real `/api/generate/cluster` route, 11 cross-browser pass, 12 [HAND] `effectivePrompt`, which the plan wants done before recording.
  - **11 Clip to graph** (`11-clip-to-graph/spec.md`, `plan.md`): nothing built on any branch. 12 tasks, thin slice is tasks 1 to 8, about 3 h. Task 3 `edgeIsValid` is [HAND].
  - **Inspector and node registry** (CONCEPT.md): nothing built. It is new work from 2026-09-20 and sits outside the picked list.
- Working line: `claude/design-system-component-reuse-321c19` d6b52b5 = design tokens and 10 `components/ui` primitives + concept-cluster + the tts card converted to Flow Kit pieces. Worktree clean at 20:02.
- Tests: `pnpm test` on d6b52b5 at 20:04 → 10 files, 94 passed, 2 todo. Build, typecheck and browsers were not run this session. Safari is unverified for build 07 (notes dated 2026-09-19).
- Other branches: `main` 4766cc9 baseline, `runway-node` 7025b6a, `concept-cluster` ead6e47, `ds-foundation` ad750bc. All are contained in the working line.
- Remote: `origin/main` 6d84f58 = stub README plus the two docs. No app code is on GitHub. It shares no history with local `main`, and 11 local commits carry a gmail author address that GitHub rejects (GH007). New commits use the repo-local noreply address.

## Decisions made (and why)
- Nick, 2026-09-20: inspector and registry both, inspector as the priority; hybrid params; media kinds only; recommended contract for now. Details in CONCEPT.md.
- Registry slice 1 goes before build 11 · build 11 task 2 writes `NODE_HANDLES`, the same per-kind port table as `NODE_KINDS`.
- `data` stays flat · API routes stay unchanged and the unversioned persisted store needs no migration.
- The old force-push seed of `main` is retired · `main` now holds PR #1. Histories join through an import PR.

## Tried and rejected
- Generating the inspector form from zod introspection · fragile, no control over order or grouping.
- One definition object per kind holding Card and `run` · import cycle through the executor, and React ends up in routes.
- Pushing this branch as is · its root commit carries the gmail address, and it shares no history with `origin/main`.

## Next (do in order)
1. Nick picks the order. A: picked builds first (recommended, steps below). B: inspector and registry first, then 11. C: leave inspector and registry until the three builds are recorded.
2. Branch off the working line. Bring the docs with `git checkout claude/flow-node-builder-handoff-061dc6 -- CONCEPT.md HANDOFF.md`. Run `pnpm install` and `pnpm test`.
3. Build 07 wrap-up: task 11, cross-browser pass in visible Chrome and Safari windows. Task 12 stays with Nick.
4. Registry slice 1, about 1 h, no visible change: `lib/node-kinds.ts` per CONCEPT.md. Tests pin today's `defaultData` and port lists first, then `defaultData` and the toolbar derive from `NODE_KINDS`.
5. Build 11 thin slice, plan tasks 1 to 8, with two amendments: `NODE_HANDLES` derives from `NODE_KINDS`, and the `reference` kind registers through `NODE_KINDS`. Task 3 stays with Nick.
6. Inspector (slice 2), then runners and views (slice 3), per CONCEPT.md. `inspectorTarget(nodes, lastId)` ships as a stub marked [HAND].
7. Past the thin slices: build 07 tasks 8 to 10, build 11 tasks 9 to 12. The [HAND] stub `shouldCollapsePrompt` in `tts-node.tsx` also stays with Nick.
8. Push path, each step with Nick's go: bundle backup, one `git filter-branch --env-filter` pass over `-- --branches --not --remotes` to swap the gmail address; an import PR (branch off `origin/main`, `git merge --allow-unrelated-histories` local `main`); then stacked PRs for `runway-node`, `concept-cluster` and the working line. `main` never gets a force push.

## Verify
`pnpm test` passes. Each build's plan ends with a 20-second demo script that runs in stub mode with zero keys; a build is done when its script plays in Chrome and Safari. For the inspector: selecting a video node shows model and duration, changing the model updates the card header, and a graph saved before the refactor reloads with its nodes and edges.
