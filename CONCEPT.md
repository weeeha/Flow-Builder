# Concept: Flow Builder, inspector and node registry

Status: decided by Nick on 2026-09-20. The contract section is the recommended shape for now and can change once the first kind runs through it.

## TL;DR

"Node builder" named three different things. Two are parts of Flow Builder. The third is a separate layer that does not exist yet.

1. **Flow level.** Compose a graph on the canvas: palette, wires, run. This is Flow Builder today.
2. **Node level.** Configure one placed node. In the reference screenshots this is the right-hand inspector. In Flow Builder today it is the inline fields on each node card. Same app, same document, one zoom level down.
3. **Kind level.** Define what a kind of node is: ports, params, runner, card. Today a developer edits five files by hand. This doc calls the missing layer the **node registry**.

Canvas and inspector are two surfaces of one product. The node registry sits under both and has a different author: a developer or an agent.

Decided: build the inspector and the registry, with the inspector as the priority. Params split between card and inspector. Media kinds only.

Naming: drop "node builder". Say **inspector** for level 2 and **node registry** for level 3. The old term covers scopes from a few hours (inspector) to weeks (a GUI for authoring kinds), so an agent told to "build the node builder" can pick the wrong one.

## Decisions (Nick, 2026-09-20)

| # | Question | Answer |
|---|---|---|
| 1 | What "node builder" means for the next build | A and B: the inspector panel and the node registry. His reply was "AB A", read as both with the inspector as the priority. A GUI for authoring kinds (C) is parked. |
| 2 | Where params live | C, hybrid. The card keeps preview, prompt and Run. The inspector holds model, duration, voice and advanced settings. |
| 3 | Node vocabulary | A, media only: image, video, tts, composition, cluster, plus reference once build 11 lands. No Agent, If/else or While. |
| 4 | Who writes the `NodeDefinition` type | Nick passed ("recommended for now"). The contract below is the recommendation. |

Build order that serves "inspector first" without writing the inspector twice: specs for all kinds (pure data, no visible change), then the inspector on top of them (first visible result), then runners and views so the executor and `nodeTypes` drop their if-chains.

## Vocabulary

| Term | Meaning | In the code today |
|---|---|---|
| Flow | The document: node instances plus edges | zustand store `flow-builder-state` in `lib/store.ts`, persisted to localStorage, no `version` or `migrate` |
| Node kind | A category of node: image, video, tts, composition, cluster | `NodeKind` union in `lib/types.ts` |
| Node instance | One placed node: id, position, kind, param values, status, output | `FlowNode` and its flat `data` object |
| Port | A typed connection point (text, image, video, audio). React Flow calls it a handle | `TypedHandle`; id grammar `{nodeId}:{type}[:{port}]` in `lib/handles.ts` |
| Param | A value the person sets on an instance: prompt, model, duration, voice | top-level keys of `data` |
| Palette | Where kinds are picked from | `components/node-toolbar.tsx`, bottom bar, flat list |
| Inspector | Panel that edits the selected instance's params | planned; params are inline on the card |
| Node registry | Typed tables keyed by kind; everything else derives from them | planned |

## The three levels

| Level | Unit | Author | Surface | Changes |
|---|---|---|---|---|
| Flow | graph | person composing a flow | canvas and palette | every session |
| Node | instance params | same person | inspector and card | every session |
| Kind | definition | developer or agent | code | when a kind is added |

## What the reference shows

The two screenshots Nick attached on 2026-09-20 show OpenAI's Agent Builder (identified by its ChatKit section and the gpt-5-mini model option). They are described here because they are not stored in the repo.

- **Screenshot 1, flow level.** Left palette with 12 kinds in 4 groups. Core: Agent, Classify, End, Note. Tools: File search, Guardrails, MCP. Logic: If/else, While, User approval. Data: Transform, Set state. Canvas with Start, two Agent nodes and sticky notes. Bottom bar: pan, select, undo, redo. Top bar: Draft badge, edit and preview modes, Evaluate, Code.
- **Screenshot 2, node level.** Selecting "Web research agent" opens a right-hand inspector: Name, Instructions, Include chat history, Model, Reasoning effort, Tools, Output format (JSON with a named schema). Below a More/Less toggle: Model parameters, ChatKit and Advanced groups.
- Node cards are compact: icon, name, kind. Every param lives in the inspector.
- No kind-level surface exists. The palette is fixed. A fixed palette with a uniform inspector implies a param schema per kind underneath (inference from the UI; their code is not visible).

So the product in the screenshots is levels 1 and 2 only.

## Where the complexity sits (measured in this repo)

Nick's guess that the flow level is the simpler one matches the code.

- The flow level is React Flow plus a 109-line executor (`lib/executor.ts` on `main`: gather inputs, topological sort, run in order). Adding the cluster kind changed `components/flow-canvas.tsx` by 2 lines.
- The kind level takes the work. The cluster kind on `concept-cluster` added `cluster-node.tsx` (261 lines), `lib/cluster.ts` (138), a schema (22), a fixture (78) and 292 lines of tests.
- Registering a kind touches 5 files with no single source of truth (commit `b6f09a5`): `lib/types.ts`, `lib/store.ts` (`defaultData`), `components/node-toolbar.tsx`, `components/flow-canvas.tsx` (`nodeTypes`) and the node component. `lib/executor.ts` gets an `if (node.type === ...)` branch once the kind runs.
- Ports are declared only in JSX inside each node component. Build 11's spec (`docs/builds/11-clip-to-graph/spec.md`) needs the same data as `NODE_HANDLES`, because its graph validator and its LLM prompt both need ports as data.
- Two params have no control at all. The image `model` has 3 options in its type and the tts `model` has 2, and neither card renders a picker. The tts header label is hard-coded.
- The pattern exists once already. `lib/models.ts` on `runway-node` holds `VIDEO_MODELS`, and its comment reads "Add a model here and both the UI and the dispatcher pick it up." The node registry is the same move one level up.

## The contract (recommended for now)

**Slice 1 built 2026-09-21** on branch `node-registry` (72068df, off the merged design-system line): `lib/node-kinds.ts` holds `NODE_KINDS` exactly as below, and `lib/store.ts` and `components/node-toolbar.tsx` derive from it. Four things the table grew on contact with the code:
- `initialData(kind)` deep-copies through `structuredClone` and adds `status`, so two nodes never share the cluster's `groups` array.
- `inPalette(spec)` takes a spec rather than reading the table, so build 11's `palette: false` is testable before a kind uses it. It requires `label` because TypeScript's weak-type rule rejects an all-optional parameter.
- `portTop(ports, i)` holds the stacking rule (one port centred, several at 24 + 32i, `top` overriding), ready for `BaseNode` in slice 3.
- `InitialData<K>` strips `BaseNodeData`'s index signature before `Omit`, or the required params would go unchecked.

Three tables keyed by `NodeKind`. Each closes with `satisfies { [K in NodeKind]: ... }`, so the compiler reports a kind that lacks an entry.

| Table | File | Holds | Imported by |
|---|---|---|---|
| `NODE_KINDS` | `lib/node-kinds.ts` | label, group, inputs, outputs, fields, initial data. Pure data | store, toolbar, inspector, build 11's validator and route, tests |
| `RUNNERS` | `lib/runners.ts` | `run` per kind. Client logic without React | `lib/executor.ts` |
| `NODE_VIEWS` | `components/nodes/registry.tsx` | icon and Card component | `flow-canvas.tsx` (`nodeTypes`), toolbar |

Why three tables and one folder of cards: a route or a Vitest file that needs ports has to import pure data without React, and cards import the executor for the Run button, so runners stored next to cards would create an import cycle.

```ts
// lib/node-kinds.ts
export type DataOf<K extends NodeKind> = Extract<FlowNode, { type: K }>["data"];

export interface PortSpec { type: HandleType; port?: string; label?: string; top?: number }

export type FieldSpec = { label: string; placement: "card" | "inspector"; group?: "advanced" } & (
  | { control: "textarea"; placeholder?: string }
  | { control: "select"; options: readonly { value: string | number; label: string; note?: string }[] }
);

export interface KindSpec<K extends NodeKind> {
  label: string;
  group: "generate" | "ideate" | "assemble";
  palette?: boolean;                            // false keeps an app-created kind (reference) off the toolbar
  inputs: readonly PortSpec[];
  outputs: readonly PortSpec[] | ((data: DataOf<K>) => readonly PortSpec[]);
  fields: Partial<Record<KnownKeys<DataOf<K>>, FieldSpec>>;
  initial: Omit<DataOf<K>, "status" | "error">;   // replaces defaultData in lib/store.ts
}

// lib/runners.ts
type Patch<K extends NodeKind> = Partial<DataOf<K>> | ((fresh: DataOf<K>) => Partial<DataOf<K>>);
export type Runner<K extends NodeKind> = (ctx: { data: DataOf<K>; inputs: NodeInputs }) => Promise<Patch<K>>;
```

The three questions decision 4 left open:

- **Required fields.** All of them, in all three tables. Completeness is checked by the compiler through `satisfies`.
- **Where `run` lives.** A client function in `RUNNERS` that resolves to a data patch. `postRoute("/api/generate/image")` builds the standard runner for image, video and tts: fold wired text with `effectivePrompt`, POST `{ data, inputs }` with `texts` emptied, return `{ outputUrl }`. Composition and cluster write their own. The cluster returns the function form of the patch, because it merges into data that can change while the roll is in flight (pins win).
- **Dynamic ports.** `outputs` may be a function of instance data. The shell (`BaseNode`) renders `inputs` and static `outputs`: one port on a side is centred, several stack at `top: 24 + 32 * i`, and `top` overrides (the cluster's single input sits at 24). A kind with function outputs renders those handles inside its card, as the cluster does beside each pinned chip.

Rules that keep the refactor safe:

- Keep `data` flat. Params stay top-level keys (`data.prompt`, `data.model`), so the API routes stay unchanged and the unversioned persisted store needs no migration.
- Handle ids have to come out identical (`handleId(nodeId, type, port)`), or saved edges detach.
- `lib/types.ts` stays the source of truth for data shapes and the `NodeKind` union. The tables add metadata and behaviour on top.
- Behaviour to preserve: a URL result currently writes both `outputUrl` and `videoUrl`, and `runAll` stops at the first error.
- Two TypeScript catches. `BaseNodeData` extends `Record<string, unknown>`, so `keyof` collapses to `string`; `KnownKeys` has to strip the index signature or field keys go unchecked. The executor's `RUNNERS[node.type](...)` call needs one cast, because TypeScript cannot correlate `node.type` with `node.data` through a record lookup.
- zod is `^4.4.2` on the working line, so `z.toJSONSchema` is available. Derive a zod object from `fields` when build 11 or an MCP client needs param schemas. Keep the form driven by `fields`.

**Slice 3 built 2026-09-23** on `registry-slice-3` (c9367e2, 0b422b8), now in PR #6: `RUNNERS` in `lib/runners.ts` (image, video and tts share `postRoute`; composition passes its first video and audio through; the cluster returns the function form of the patch), `NODE_VIEWS` in `components/nodes/registry.tsx` with `nodeTypes` derived from it, and `shellPorts(kind)` so `BaseNode` draws every input and static output. The executor's `applyPatch` re-reads the node and skips one deleted mid-run. `scripts/check-runall-chrome.mjs` confirms a graph saved before the refactor reloads with its edges and handle offsets intact.

## Card and inspector split (decision 2C)

| Kind | Card keeps | Inspector gets | Today |
|---|---|---|---|
| image | preview, prompt, Run | model | no model control exists |
| video | preview, prompt, Run | model with provider, duration | both are footer selects on the card |
| tts | player, text, Run | voice, model | voice is a select on the card; no model control exists |
| composition | preview | nothing yet | no params |
| cluster | prompt, groups, pins, Re-roll all | nothing yet | the LLM model comes from env |

The card header keeps its read-only model label, so the model in use stays visible on the canvas.

## Inspector behaviour

**Slice 2 built 2026-09-21** on branch `inspector` (629bf1b): `components/inspector.tsx` renders every field whose `placement` is `inspector`, in table order, for the one selected node. What the build added beyond the description below:
- `lib/inspector.ts` holds the pure part: `inspectorFields(kind)`, `fieldValue(spec, raw)` (a select writes the option's own value, so `duration` stays the number 6), and `inspectorTarget` (decided 2026-09-23, below).
- `optionLabel(kind, key, value)` in the kind table feeds the card headers, so the tts card stops hard-coding its model name and every header reads the same label the panel shows.
- The video card keeps a read-only `4s` in its footer, so the duration stays visible once its select moves to the panel.
- Icons lived in `components/nodes/icons.tsx` until slice 3 folded them into `NODE_VIEWS`.
- The More/Less toggle is built but renders only when a field declares `group: "advanced"`. None does yet.

- A right-hand `aside` floating over the canvas, about 340px wide (estimated from the screenshot). It is non-modal: no overlay, no focus trap, and the canvas stays interactive. Radix Dialog and Sheet are modal, so use a plain positioned element.
- It shows when exactly one node is selected. Header: kind icon and label. Body: every `placement: "inspector"` field. Fields with `group: "advanced"` sit behind a More/Less toggle, as in the reference.
- Controls come from `components/ui` (select, input, textarea). Every control has a visible label and a focus ring, and the panel follows the canvas in tab order.
- Decided by Nick 2026-09-23 (3A): the panel closes with nothing or several selected, like the reference. `inspectorTarget(nodes)` returns the one selected node or null; `lastId` was dropped.

## Related work

A coded Flow Kit sits on branch `wave-2-flow-foundation` of `weeeha/Super-AI-Components` (local checkout `~/ClaudeCode Projects/AI Components`, path `apps/docs/registry/super-ai/flow/`): ai-node, typed-handle, typed-edge, port-chip, connection-hint, node-prompt, media-slot, model-bar, run-button, node-status, use-flow-runner, each with a test file. It supplies parts for a node card, which makes it the UI half of the kind level. The tables above are the data half. The tts card was converted to kit pieces (media-slot, node-prompt) on 2026-09-20, commit `296bafe` on `claude/design-system-component-reuse-321c19`.

## Out of scope for now

- A GUI for authoring kinds (1C).
- Agent and control-flow kinds (3B). Today's runner sorts a DAG topologically.
- Palette redesign. The bottom bar stays; its buttons derive from `NODE_KINDS`.
- Moving node files into one folder per kind. Worth doing after the live card conversions land.
- Multiplayer and saved templates.
