# Handoff · Flow Builder · 2026-09-20 19:46 EDT
Branch: claude/flow-node-builder-handoff-061dc6 · PR: https://github.com/weeeha/Flow-Builder/pull/1 (from the docs-only branch, see State) · Preview: none (no dev server for this repo was running at 18:52)

## Goal
Build an inspector panel and a node registry for Flow Builder, as defined and decided in CONCEPT.md. This branch holds the concept and this handoff only.

## Done (this session)
- CONCEPT.md, first version with 4 open decisions · f875138
- CONCEPT.md, Nick's answers recorded plus the recommended contract (three typed tables, card and inspector split, inspector behaviour) · 6ef02ff
- HANDOFF.md · this commit
- PR #1, open and ready for review, 2 files · pushed as `claude/flow-node-builder-handoff-061dc6-docs`, a docs-only branch built on the GitHub stub `main`
- No app code changed. This local branch is `main` plus two root files. Take the docs into any branch with `git checkout claude/flow-node-builder-handoff-061dc6 -- CONCEPT.md HANDOFF.md`.

## State right now
- Uncommitted: none here. The `design-system-component-reuse-321c19` worktree had uncommitted work from another session at 19:32: modified `components/nodes/tts-node.tsx`, `app/globals.css`, `app/ui-kit/page.tsx`, `package.json`, `vitest.config.mts`; untracked `components/flow/`, `lib/flow-status.ts`, `vitest.setup.ts`. It is converting the tts card to Flow Kit pieces. The other 5 worktrees are clean.
- Tests: `pnpm test` on `concept-cluster` (ead6e47) at 18:52 → 4 files, 61 passed, 1 todo. `main` and `runway-node` have no test runner. Build, typecheck and browsers were not run this session.
- Branches (all local, read at 19:32):
  - `main` 4766cc9: baseline. `runway-node` 7025b6a: main + Runway video provider + `lib/models.ts`.
  - `concept-cluster` ead6e47: runway-node + foundation F1 to F4 + build 07 tasks 1 to 7. Tasks 8 to 11 are unbuilt.
  - `ds-foundation` ad750bc: main + 10 `components/ui` primitives and tokens.
  - `claude/design-system-component-reuse-321c19` d633feb: ds-foundation merged with concept-cluster. The working line for the next build. Its merge result is unverified here.
- Blockers:
  - The live session above edits the same node files this build touches. Start after it commits.
  - No code branch can be pushed or get a PR yet. `origin/main` (github.com/weeeha/Flow-Builder) is still the stub commit c84425c and shares no history with local `main`. 11 local commits, including the root commit of every local branch, carry a gmail author address, which GitHub rejects (GH007). New commits use the repo-local noreply address. Only the docs branch for PR #1 is on the remote.

## Decisions made (and why)
- Nick, 2026-09-20: build both inspector and registry with the inspector as the priority ("1 AB A"); hybrid params (2C); media kinds only (3A); recommended contract for now (4). Details in CONCEPT.md.
- Order is specs, then inspector, then runners and views · the inspector becomes the first visible result and is written once.
- `data` stays flat · API routes stay unchanged and the unversioned persisted store needs no migration.
- Three tables instead of one object per kind · routes and tests need ports without React, and cards import the executor.
- Inspector is a non-modal `aside` · Radix Dialog and Sheet trap focus and block the canvas.

## Tried and rejected
- Generating the inspector form from zod introspection · fragile and gives no control over order or grouping. `fields` drive the form; zod is derived later for build 11 or MCP.
- One definition object per kind holding Card and `run` · creates an executor, registry, card, executor import cycle and pulls React into routes.
- From notes dated 2026-09-19, not re-tested: a hidden or background browser tab reports missing React Flow edges and dead Enter and Space keys. Use a visible window or headless Chrome.

## Next (do in order)
1. Confirm the design-system worktree is committed (`git -C .claude/worktrees/design-system-component-reuse-321c19 status --short`). Branch `node-registry` off that branch, merge this branch in for the docs, run `pnpm install` and `pnpm test`.
2. Slice 1, no visible change: write `lib/node-kinds.ts` per CONCEPT.md for the 5 kinds. First add tests that pin today's `defaultData` values and each kind's port list, then derive `defaultData` in `lib/store.ts` and the toolbar buttons from `NODE_KINDS`.
3. Slice 2, first visible result: the inspector per CONCEPT.md. Move video model and duration and tts voice off the cards; add the missing image model and tts model controls. Leave `inspectorTarget(nodes, lastId)` as a stub that returns the single selected node, marked [HAND] for Nick.
4. Slice 3: `lib/runners.ts` and `components/nodes/registry.tsx`; the executor and `nodeTypes` read the tables; `BaseNode` renders static ports from the spec and the per-card `TypedHandle` lines for static ports go away.
5. Check in visible Chrome and Safari windows before calling any slice done.
6. Separate open work: build 07 tasks 8 to 11. Two [HAND] stubs belong to Nick and stay untouched: the `it.todo` in `lib/__tests__/prompt.test.ts` and `shouldCollapsePrompt` in the live tts conversion.
7. Before any push, with Nick's go: bundle backup, one `git filter-branch --env-filter` pass over `-- --branches --not --remotes` to swap the gmail address for the noreply one, then seed `main` once with `--force-with-lease` (the lease value changes if PR #1 was merged first). After that, branches and PRs only, and PR #1's branch needs a rebase onto the real `main` or a replacement PR from this branch.

## Verify
`pnpm test` passes. Then `pnpm dev` and open http://localhost:3000 (3107 if 3000 is taken) in Chrome and Safari: selecting a video node opens the inspector with model and duration, changing the model updates the card's header label, a graph saved before the refactor reloads with its nodes and edges, and Run all still produces outputs in stub mode.
