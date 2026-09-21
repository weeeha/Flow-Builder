# Handoff · Flow Builder · 2026-09-20 20:35 EDT
Branch: claude/flow-node-builder-handoff-061dc6 (local, not pushed) · PR: #1 merged (older revisions of CONCEPT.md and HANDOFF.md) · Preview: none (no dev server was started this session)

## Goal
Finish the three builds Nick picked for Flow Builder (00 foundation, 07 Concept Cluster, 11 Clip to graph) and add the inspector and node registry from CONCEPT.md. This file sequences all four.

## Done (this session)
- CONCEPT.md: levels, Nick's decisions, the recommended registry contract; now with `palette?: boolean` on the kind spec
- `docs/builds/07-concept-cluster/` and `docs/builds/11-clip-to-graph/`, each with `spec.md` and `plan.md`: the 2026-09-19 drafts refreshed against the code at 296bafe. Every spec opens with "Changes since the 2026-09-19 draft".
- PR #1 merged into `origin/main` earlier today (docs only). Everything after it is local.
- No app code changed in this session.

## State right now
- History was rewritten on 2026-09-20 around 20:10 by another session: the author email changed on every local branch, so every SHA noted before that is dead. Trees are identical. A bundle backup of the old history sits next to the repo folder.
- Picked builds:
  - **00 foundation**: built. F1 to F4 are e37fc0a, e2fcb86, 5164ba4, b7c22f4.
  - **07 Concept Cluster**: thin slice built (tasks 1 to 7, tip 1f64a90). 80 min open: tasks 8 to 12. Task 12 is [HAND].
  - **11 Clip to graph**: nothing built. Thin slice is tasks 1 to 8, about 3 h. Task 3 is [HAND].
  - **Inspector and node registry** (CONCEPT.md): nothing built. It sits outside the picked list.
- Working line: `claude/design-system-component-reuse-321c19` 296bafe. It contains `main` a556f6c, `runway-node` 5b59b7c, `concept-cluster` 1f64a90 and `ds-foundation` 507bdb2.
- Tests: `pnpm test` at 20:04 on the working line's tree → 10 files, 94 passed, 2 todo. Build, typecheck and browsers were not run this session. Safari is unverified for build 07.
- Remote (github.com/weeeha/Flow-Builder): `origin/main` 6d84f58 = stub README plus the two docs from PR #1. Open PR stack, merged by Nick in this order: #2 `import-app` into `main`, #3 `runway-node`, #4 `concept-cluster`, #5 the working line. Local `main` differs from `origin/main` until #2 merges.
- Blockers: none for building. Order A, B or C below is still Nick's call.

## Decisions made (and why)
- Nick, 2026-09-20: inspector and registry both, inspector as the priority; hybrid params; media kinds only; recommended contract for now. Build docs refreshed into the repo in his build format.
- Build docs carry engineering content only · the repo is public.
- Registry slice 1 goes before build 11 · build 11 task 2 needs the same per-kind port table as `NODE_KINDS`. The plan keeps a hand-written fallback.
- The model may only author image, video, tts and composition nodes · `validateGraph` checks a fixed list, so `cluster` and `reference` stay app-created.
- `palette: false` on the kind spec · the `reference` kind must stay off a toolbar that derives from `NODE_KINDS`.
- `data` stays flat · API routes stay unchanged and the unversioned persisted store needs no migration.

## Tried and rejected
- Generating the inspector form from zod introspection · fragile, no control over order or grouping.
- One definition object per kind holding Card and `run` · import cycle through the executor, and React ends up in routes.
- Build 11 draft, task 8 listed `node-toolbar.tsx (nodeTypes only)` · `nodeTypes` lives in `flow-canvas.tsx`; the entry moved to task 7 and the toolbar waits for task 12.

## Next (do in order)
1. Nick: merge PRs #2 to #5 in order, pick the build order (A picked builds first, recommended and assumed below; B inspector and registry first; C registry and inspector after the three builds), and review the four build docs.
2. Branch off the working line, or off `main` once the stack is merged. Bring the docs with `git checkout claude/flow-node-builder-handoff-061dc6 -- CONCEPT.md HANDOFF.md docs/`. Run `pnpm install` and `pnpm test`.
3. Build 07 task 11: cross-browser pass in visible Chrome and Safari windows.
4. Registry slice 1, about 1 h, no visible change: `lib/node-kinds.ts` per CONCEPT.md. Tests pin today's `defaultData` and port lists first.
5. Build 11 thin slice: tasks 1 to 8 of `docs/builds/11-clip-to-graph/plan.md`.
6. Inspector (slice 2), then runners and views (slice 3), per CONCEPT.md.
7. Past the thin slices: build 07 tasks 8 to 10, build 11 tasks 9 to 12.
8. [HAND] stubs stay with Nick: `effectivePrompt` (`it.todo` in `lib/__tests__/prompt.test.ts`), `edgeIsValid`, `inspectorTarget`, `shouldCollapsePrompt` in `tts-node.tsx`.
9. Publishing these docs, with Nick's go: after #2 merges, merge `origin/main` into this branch (expect add/add conflicts on CONCEPT.md and HANDOFF.md, keep this branch's versions), push, open a PR.

## Verify
`pnpm test` passes. Each build plan ends with an acceptance walkthrough that runs in stub mode with zero keys; a build is done when its walkthrough plays in Chrome and Safari. For the inspector: selecting a video node shows model and duration, changing the model updates the card header, and a graph saved before the refactor reloads with its nodes and edges.
