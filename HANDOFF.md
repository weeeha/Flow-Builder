# Handoff · Flow Builder · 2026-09-20 22:05 EDT
Branch: claude/roadmap-specs-review-d07960 (docs, local, off `main` 74098b2, not pushed) · Code: merged into `claude/design-system-component-reuse-321c19`, now 571fe09 locally (b71f6f9 tasks 8-9, 596ce20 task 10, 571fe09 check scripts); `origin` still holds 296bafe for that branch · PR: none new; PR #5's branch is 3 commits ahead locally · Preview: http://localhost:3000 while `pnpm dev` runs in the design-system worktree

## Goal
Finish the three builds Nick picked for Flow Builder (00 foundation, 07 Concept Cluster, 11 Clip to graph) and add the inspector and node registry from CONCEPT.md, in the order Nick chose on 2026-09-20 (order 4: finish 07, registry slice 1, inspector, runners and views, then build 11).

## Done (this session)
- Reviewed CONCEPT.md, HANDOFF.md and the four build docs against the code at 296bafe; every checkable claim held. Docs moved onto this branch, which is based on the merged `main`, and updated as work landed.
- Build 07 tasks 8, 9 and 10 built test first on a task branch, then fast-forwarded into `claude/design-system-component-reuse-321c19` (571fe09) with the suite green on the merged tree: `lib/branch.ts` (`branchFromPin`, both branch kinds, tested against the real store), `rerollGroup` and `rerollClusterGroup` (one group re-rolls alone, pins win), the to-video button and a shuffle button per group header, and `app/api/generate/cluster/route.ts` (fixture rotation without a key, `generateText` with `Output.object` and one retry on a schema failure with a key). The executor posts to the route for Run, Run all and the per-group re-roll.
- `ai` upgraded from ^5 to ^7 (registry `latest`; v6 is already a legacy dist-tag and nothing imported `ai` before this route). `generateObject` is deprecated since AI SDK 6, so the route uses `generateText` with `Output.object`. `vitest.config.mts` aliases `server-only` to Next's empty shim so route tests can import `lib/llm.ts`.
- Task 11, Chrome half: `scripts/check-cluster-chrome.mjs` drives headless Chrome over the DevTools protocol with real input events, 14/14 checks on the final code (chips, Tab focus with `:focus-visible`, Enter and Space pin toggles, pin handle, to video wired, a second pin connecting by drag, one-group re-roll with both pins intact). Screenshot saved by the script.
- Task 11, Safari half: `scripts/check-cluster-safari.mjs` is written and mirrors the Chrome checks through safaridriver, but Safari refused the session: "Allow remote automation" is off in Safari's Developer settings. That is Nick's setting to change; nothing else was tried.
- `pnpm test` on the merged design-system branch (571fe09): 13 files, 114 passed, 2 todo. `pnpm typecheck` clean. The route answered through the dev server in stub mode: first set, then the second set when sent the first, 400 on an empty prompt.

## State right now
- `main` = `origin/main` = 74098b2 (PR #2 merged). PRs #3 `runway-node`, #4 `concept-cluster`, #5 `claude/design-system-component-reuse-321c19` were not in `origin/main` at the last local fetch; run `git fetch` before assuming more.
- Working line for code: `claude/design-system-component-reuse-321c19` at 571fe09 locally, 3 commits ahead of `origin` (296bafe, PR #5). Pushing it updates PR #5 in place; Nick's go needed. `cluster-finish` was fast-forwarded in and deleted.
- Picked builds:
  - **00 foundation**: built. F1 to F4 are e37fc0a, e2fcb86, 5164ba4, b7c22f4.
  - **07 Concept Cluster**: tasks 1 to 10 built. Open: task 11's Safari half (blocked on the Safari setting), task 12 [HAND].
  - **11 Clip to graph**: nothing built. Thin slice is tasks 1 to 8, about 3 h. Task 3 is [HAND].
  - **Inspector and node registry** (CONCEPT.md): nothing built. No `node-kinds`, `runners`, `registry` or inspector file exists on any branch.
- Docs: this branch holds the current CONCEPT.md, HANDOFF.md and `docs/builds/`. `claude/flow-node-builder-handoff-061dc6` (af4943e) is superseded; `origin/main` holds the PR #1 revision.
- Dev server: `pnpm dev` runs in the design-system worktree on port 3000 (started 2026-09-20 22:20; may have stopped since). One React Flow console warning (error 004, container needs a size) appeared once at pane startup, before any node was added; not investigated.
- Blockers: none for the next code step (registry slice 1).

## Decisions made (and why)
- Nick, 2026-09-20 21:05, build order 4: finish 07, registry slice 1, inspector, runners and views, then build 11 on the finished registry. Nick then picked "2 and then 3": build 07 tasks 8, 9, 11 first, then the SDK upgrade and task 10.
- `ai` ^7 rather than ^6 · the registry's `latest` is 7.0.107 and v6 is a legacy tag; nothing imported `ai` before, so the choice cost nothing. Downgrading is a one-line change if Nick wants v6.
- `generateText` + `Output.object` instead of `generateObject` · deprecated since AI SDK 6 per the installed docs (`node_modules/ai/docs/08-migration-guides/24-migration-guide-6-0.mdx`).
- The retry keys on `NoObjectGeneratedError` only · any other failure (gateway 401, network) surfaces at once in the node's error banner.
- Cross-browser checks as committed scripts, not hand checks · the pass is repeatable and produces a screenshot; the built-in Browser pane's synthetic Enter and Space do not fire default clicks, so it cannot stand in for either browser.
- Branch action extracted to `lib/branch.ts` · the store-level seam made a real test possible without rendering React Flow.
- Nick, 2026-09-20 22:15: merge back locally (option 1 of the finishing menu) · fast-forward into the design-system branch, tests and typecheck green on the merged tree, task branch deleted.

## Tried and rejected
- `vi.mock("server-only")` · vitest cannot resolve a module that only Next provides; the alias to `next/dist/compiled/server-only/empty.js` works.
- Selecting suggestion groups by `[role=group]` index in the check scripts · React Flow adds its own `role=group` elements per edge, which shifts the indices; select by the `"<axis> suggestions"` label instead.
- Generating the inspector form from zod introspection; one definition object per kind · see CONCEPT.md, unchanged.

## Next (do in order)
1. Nick: turn on Safari > Settings > Developer > Allow remote automation, then with `pnpm dev` up run `safaridriver -p 4445 &` and `node scripts/check-cluster-safari.mjs`. Expect 14/14; note any difference from Chrome.
2. Publish, with Nick's go: push `claude/design-system-component-reuse-321c19` (updates PR #5 with tasks 8-10); push this docs branch and open a PR against `main`.
3. Registry slice 1, about 1 h, no visible change: `lib/node-kinds.ts` per CONCEPT.md. Tests pin today's `defaultData` and port lists first. Branch off `claude/design-system-component-reuse-321c19`.
4. Inspector (slice 2): the first visible result. `inspectorTarget(nodes, lastId)` stays a [HAND] stub.
5. Runners and views (slice 3): `lib/runners.ts` and `components/nodes/registry.tsx`; move the cluster fetch from `rollCluster` into `RUNNERS.cluster`; the executor and `nodeTypes` read the tables.
6. Build 11 thin slice, tasks 1 to 8, on the finished registry.
7. Past the thin slices: 11 tasks 9 to 12; 07 task 12 [HAND].
8. [HAND] stubs stay with Nick: `effectivePrompt` (`it.todo` in `lib/__tests__/prompt.test.ts`), `edgeIsValid`, `inspectorTarget`, `shouldCollapsePrompt` in `tts-node.tsx`.
9. First real model call, when a key exists: set `AI_GATEWAY_API_KEY` in `.env.local`, Run a cluster node, and confirm the three unverified items in the 07 spec (schema-failure error class, plain string slug through the gateway, zod 4 `.refine` against `Output.object`).

## Verify
`pnpm test` passes (13 files, 114 passed, 2 todo) and `pnpm typecheck` is clean. `node scripts/check-cluster-chrome.mjs` reports 14/14 against `pnpm dev`. Each build plan ends with an acceptance walkthrough that runs in stub mode with zero keys; a build is done when its walkthrough plays in Chrome and Safari.
