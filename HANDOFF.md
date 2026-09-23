# Handoff · Flow Builder · 2026-09-23
Branch: `clip-to-graph` (code, PR #6) and `claude/roadmap-specs-review-d07960` (these docs) · Preview: none on Vercel; `pnpm dev` then http://localhost:3000 (port 3107 in the last session)

## Goal
Finish Nick's picked builds (00 foundation, 07 Concept Cluster, 11 Clip to graph) plus the inspector and node registry from CONCEPT.md, in build order 4. All of it is now built and in PR #6.

## Done (2026-09-23)
- Registry slice 3: `RUNNERS` (`lib/runners.ts`), `NODE_VIEWS` (`components/nodes/registry.tsx`), `BaseNode` draws static ports via `shellPorts` · c9367e2, 0b422b8
- Build 11 tasks 1 to 12: frames, FlowDoc, analyze route (stub, live with one repair, local fallback), `loadGraph`/`buildGraph`, reference kind, drop and Choose clip, staggered reveal, frame strip and validity log, error states and skeleton offer · 231b251 to 4201425
- Nick's decisions, all recorded in code: 1A `edgeIsValid` rejects named ports; 2A own prompt first; 3A inspector closes; 4A tts never collapses; 6A composition takes audio; 7A keep 3 frames; 8A drops slide clear of cards; 9A spacing 480 x 400; 10A no queued status; 11A keep AI SDK 7 · 805a4ed and the commits after it
- `check-cluster-chrome.mjs` flake fixed: the Re-roll button sat off screen and the click hit nothing · e4b5c6a
- PR #6 opened: `clip-to-graph` into `main`, carrying everything since the import

## State right now
- Tests: `pnpm test` 25 files, 265 passed, 1 todo (queued status, parked). `pnpm typecheck` clean.
- Browser: headless Chrome against `pnpm dev`, stub mode: palette 7/7, inspector 15/15, cluster 14/14, runall 15/15, clip-drop 21/21, clip-errors 10/10.
- Not verified: Safari (needs Safari > Settings > Developer > Allow remote automation); any live model or provider call (no keys set anywhere); a dropped clip after a reload (object URL, no Blob upload yet).
- Local branches `inspector`, `registry-slice-3`, `claude/design-system-component-reuse-321c19` are all ancestors of `clip-to-graph`; safe to delete once PR #6 merges.

## Decisions made (and why)
- The HAND items were decided by Nick as options (answers 1A to 11A) and written by Claude to those rules, since he picked a rule rather than "I'll write it".
- `generateText` + `Output.object` and file parts for frames · `generateObject` and image parts are deprecated in the installed AI SDK 7.
- Over-60s clips are read from their first 60s automatically · nothing past 60s can be read, so asking first adds a click with no real choice.
- `loadGraph` split into `buildGraph` + `addGraph` · the staggered reveal needs to add nodes piecewise without minting new ids.

## Tried and rejected
- Plan layout spacing 320 x 220 · overlaps real cards (widest 420, tallest about 360).
- Persisting all 8 frames · about 109KB per clip in localStorage.
- Treating the cluster check failure as an app regression · logging showed the app re-rolled correctly every time; the test clicked off screen.

## Next (do in order)
1. Review and merge PR #6, then this docs PR.
2. Nick: switch on Safari remote automation, then `safaridriver -p 4445 &` and `node scripts/check-cluster-safari.mjs` with `pnpm dev` up. Port the four other Chrome scripts to Safari when that works.
3. Set `AI_GATEWAY_API_KEY` in `.env.local` and drop a real clip: confirm the gateway slug, file parts, and request size for 8 frames (spec.md section 10).
4. Set `BLOB_READ_WRITE_TOKEN` so a dropped clip survives a reload; then wire `clipMissing` on the reference card.

## Verify
`pnpm test` and `pnpm typecheck` (with no dev server in the same worktree, or `rm -rf .next/dev/types` first). With `pnpm dev` up: `node scripts/check-<name>-chrome.mjs` for palette, inspector, cluster, runall, clip-drop, clip-errors (APP_URL if not port 3000). All should pass.
