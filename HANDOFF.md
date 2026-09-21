# Handoff · Flow Builder · 2026-09-20 21:10 EDT
Branch: claude/roadmap-specs-review-d07960 (local, off `main` 74098b2, not pushed) · PR: none yet for these docs (PR #1 merged older revisions) · Preview: none (no dev server this session)

## Goal
Finish the three builds Nick picked for Flow Builder (00 foundation, 07 Concept Cluster, 11 Clip to graph) and add the inspector and node registry from CONCEPT.md. This file sequences all four in the order Nick chose on 2026-09-20 (order 4, see Decisions).

## Done (this session)
- Read CONCEPT.md, HANDOFF.md and the four build docs against the code at 296bafe. Every checkable claim held: the cited line counts, `runDisabled` on BaseNode, `useUpdateNodeInternals`, the two-set fixture, `hasLlmKey` and `LLM_MODEL` in the server-only helper, both [HAND] `it.todo` stubs, the `shouldCollapsePrompt` stub, build 11's port table against the JSX handles, no picker for the image and tts `model`, the unversioned persist store, the executor's double URL write and stop on first error, the F1 to F4 and 07 task SHAs, and no `generateObject` call anywhere.
- Ran `pnpm test` and `pnpm typecheck` in the design-system worktree at 296bafe: 10 files, 94 passed, 2 todo; typecheck clean.
- Nick chose the build order (Decisions).
- Docs moved onto this branch, which is based on the merged `main`, so they can be pushed and PR'd without the add/add conflicts the previous handoff expected. Fixed on the way: 07 spec §4 wording on cluster special-casing, the stale "local main differs from origin/main" state, and the order-dependent paragraphs in the 07 and 11 docs.
- No app code changed in this session.

## State right now
- `main` = `origin/main` = 74098b2: PR #2 (`import-app`) merged. PRs #3 `runway-node`, #4 `concept-cluster`, #5 `claude/design-system-component-reuse-321c19` were not in `origin/main` at the last local fetch; run `git fetch` before assuming more.
- Working line: `claude/design-system-component-reuse-321c19` 296bafe, 13 commits ahead of `main`. Contains `runway-node` 5b59b7c, `concept-cluster` 1f64a90 and `ds-foundation` 507bdb2.
- Picked builds:
  - **00 foundation**: built. F1 to F4 are e37fc0a, e2fcb86, 5164ba4, b7c22f4.
  - **07 Concept Cluster**: thin slice built (tasks 1 to 7, tip 1f64a90). 80 min open: tasks 8 to 12. Task 12 is [HAND]. Safari has never been checked.
  - **11 Clip to graph**: nothing built. Thin slice is tasks 1 to 8, about 3 h. Task 3 is [HAND].
  - **Inspector and node registry** (CONCEPT.md): nothing built. No `node-kinds`, `runners`, `registry` or inspector file exists on any branch.
- Tests: `pnpm test` at 20:58 on 296bafe → 10 files, 94 passed, 2 todo. `pnpm typecheck` clean. Build and browsers were not run.
- Docs: this branch holds the current CONCEPT.md, HANDOFF.md and `docs/builds/`. `claude/flow-node-builder-handoff-061dc6` (af4943e) holds the previous revision and is superseded; `origin/main` holds the PR #1 revision.
- Blockers: none for building.

## Decisions made (and why)
- Nick, 2026-09-20 21:05, build order 4: finish 07 (tasks 8 to 11), then registry slice 1, then the inspector (slice 2), then runners and views (slice 3), then build 11's thin slice on the finished registry · it honours "inspector first" from CONCEPT.md, and build 11 never hand-writes `NODE_HANDLES` or registers `reference` through hand-edited files. Orders considered: 1 picked builds first with registry 1 before 11 (the earlier default), 2 inspector and registry first, 3 registry and inspector after both builds.
- Earlier decisions stand: inspector and registry both, inspector as the priority; hybrid params; media kinds only; the recommended contract; `palette: false` for `reference`; the model may only author image, video, tts and composition; `data` stays flat.
- Build docs carry engineering content only · the repo is public.

## Tried and rejected
- Generating the inspector form from zod introspection · fragile, no control over order or grouping.
- One definition object per kind holding Card and `run` · import cycle through the executor, and React ends up in routes.
- Merging `origin/main` into the old docs branch · add/add conflicts on both root docs; rebasing the docs onto `main` on this branch avoids them.

## Next (do in order)
1. Publish these docs, with Nick's go: push this branch, open a PR against `main`.
2. Branch off the working line 296bafe (or off `main` once #3 to #5 merge). Run `pnpm install && pnpm test`: expect 10 files, 94 passed, 2 todo.
3. Build 07 tasks 8, 9 and 11 per `docs/builds/07-concept-cluster/plan.md`. Task 11 needs visible Chrome and Safari windows.
4. Before 07 task 10, the repo's first `generateObject` call: settle the SDK version. `ai` is `^5.0.0`; current AI Gateway guidance targets `ai@^6`. Recommendation: upgrade once, before the call is written, so 07 task 10 and 11 tasks 5 and 9 share one API. Then build task 10 with the fetch in the executor's `"cluster"` branch; slice 3 moves it into `RUNNERS.cluster`.
5. Registry slice 1, about 1 h, no visible change: `lib/node-kinds.ts` per CONCEPT.md. Tests pin today's `defaultData` and port lists first.
6. Inspector (slice 2): the first visible result. `inspectorTarget(nodes, lastId)` stays a [HAND] stub.
7. Runners and views (slice 3): `lib/runners.ts` and `components/nodes/registry.tsx`; the executor and `nodeTypes` read the tables.
8. Build 11 thin slice, tasks 1 to 8, on the finished registry: `NODE_HANDLES` derives from `NODE_KINDS`, `reference` registers through the three tables with `palette: false`.
9. Past the thin slices: 11 tasks 9 to 12; 07 task 12 [HAND].
10. [HAND] stubs stay with Nick: `effectivePrompt` (`it.todo` in `lib/__tests__/prompt.test.ts`), `edgeIsValid`, `inspectorTarget`, `shouldCollapsePrompt` in `tts-node.tsx`.

## Verify
`pnpm test` passes. Each build plan ends with an acceptance walkthrough that runs in stub mode with zero keys; a build is done when its walkthrough plays in Chrome and Safari. For the inspector: selecting a video node shows model and duration, changing the model updates the card header, and a graph saved before the refactor reloads with its nodes and edges.
