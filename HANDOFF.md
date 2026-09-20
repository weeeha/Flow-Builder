# Handoff · Flow Builder · 2026-09-20 18:57 EDT
Branch: claude/flow-node-builder-handoff-061dc6 · PR: none · Preview: none (no dev server for this repo was running at 18:52)

## Goal
Define what "Flow Builder" and "Node Builder" mean (CONCEPT.md) and record the state of every branch so any agent can continue cold.

## Done (this session)
- CONCEPT.md: flow, node and kind levels, vocabulary, evidence from the code, 4 open decisions · f875138
- HANDOFF.md: this file · this commit
- No app code changed. This branch is `main` plus these two root files, so it merges into any branch without conflicts.

## State right now
- Uncommitted: none here. The `design-system-component-reuse-321c19` worktree has untracked `components/flow/` and `lib/flow-status.ts`, written by another session that was active at 18:56. The other 5 worktrees are clean.
- Tests: `pnpm test` on `concept-cluster` (ead6e47) → 4 files, 61 passed, 1 todo. `main` and `runway-node` have no test runner. Build, typecheck and browsers were not run this session.
- Branches (all local, read at 18:56):
  - `main` 4766cc9: baseline. 4 node kinds, params inline on the cards, no tests.
  - `runway-node` 7025b6a: main + Runway video provider + the `lib/models.ts` registry. Checked out in the repo root.
  - `concept-cluster` ead6e47: runway-node + foundation F1 to F4 (zod, Vitest, handle grammar, text wiring, LLM helper) + build 07 tasks 1 to 7. Tasks 8 to 11 are unbuilt.
  - `ds-foundation` ad750bc: main + 10 `components/ui` primitives and design tokens.
  - `claude/design-system-component-reuse-321c19` d633feb: ds-foundation merged with concept-cluster at 18:49. Most complete line, still moving, and its merge result is unverified here.
  - 4 other `claude/*` branches hold no commits of their own.
- Blockers:
  - Nothing is pushed. `origin` (github.com/weeeha/Flow-Builder) holds only the stub commit c84425c. 11 local commits carry a gmail author address, which GitHub rejects (GH007). New commits use the repo-local noreply address.
  - CONCEPT.md decisions 1 to 4 are open.

## Decisions made (and why)
- "Node builder" is retired in favour of "inspector" (node level) and "node registry" (kind level) · the old term covered scopes from hours to weeks.
- The concept lives in CONCEPT.md · HANDOFF.md is overwritten every session.
- The reference screenshots are described in text and left out of the repo · public repo, third-party UI.
- Design docs stay outside the repo in `~/ClaudeCode Projects/Runaway/builds/` (README.md, ranking.md, one folder per build) · read them before touching builds 07 or 11.

## Tried and rejected
- None this session. From notes dated 2026-09-19, not re-tested: checking React Flow in a hidden or background browser tab reports missing edges and dead Enter and Space keys. Both are false alarms. Use a visible window or headless Chrome.

## Next (do in order)
1. Nick answers the CONCEPT.md decisions by number and letter, for example "1B 2C 3A". Build nothing from the concept before that.
2. Re-read branch tips (`git branch -vv`), then base the work on `claude/design-system-component-reuse-321c19` once its session is done. It is the only line with Vitest, zod, the handle grammar and `components/ui`. Merge this branch in for the two docs.
3. [HAND] Nick writes the `NodeDefinition` type in `lib/node-registry.ts` (decision 4).
4. Registry refactor with no visible change: define the 5 kinds, then derive `nodeTypes`, `defaultData`, the palette and the executor dispatch from them. Add persist `version` and `migrate` in `lib/store.ts` before changing any `data` shape. Add a test that every `NodeKind` has a definition.
5. Inspector per decision 2. `components/ui` has button, dialog, dropdown-menu, input, popover, select, skeleton, textarea and tooltip. It has no sheet, switch or tabs yet.
6. Separate open work: build 07 tasks 8 to 11 on `concept-cluster`. The `it.todo` in `lib/__tests__/prompt.test.ts` (`effectivePrompt` with both inputs present) is Nick's own task. Leave it alone.
7. Before any push, with Nick's go: make a bundle backup, run one `git filter-branch --env-filter` pass over `-- --branches --not --remotes` to swap the gmail address for the noreply one, then seed `main` once with `--force-with-lease`. After that, branches and PRs only.

## Verify
`pnpm test` passes on the working branch. Then `pnpm dev` and open http://localhost:3000 (3107 if 3000 is taken) in visible Chrome and Safari windows: every registered kind appears in the palette, and a graph saved before the refactor reloads with its nodes and edges.
