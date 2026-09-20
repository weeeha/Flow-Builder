# Concept: Flow Builder and "Node Builder"

Status: draft for Nick's review · 2026-09-20 · Decisions 1 to 4 at the bottom are open.

## TL;DR

"Node builder" currently names three different things. Two are parts of Flow Builder. The third is a separate layer that does not exist yet.

1. **Flow level.** Compose a graph on the canvas: palette, wires, run. This is Flow Builder today.
2. **Node level.** Configure one placed node. In the reference screenshots this is the right-hand inspector. In Flow Builder today it is the inline fields on each node card. Same app, same document, one zoom level down.
3. **Kind level.** Define what a kind of node is: ports, params, runner, card. Today a developer edits five files by hand. This doc calls the missing layer the **node registry**.

Canvas and inspector are two surfaces of one product. The node registry sits under both and has a different author: a developer or an agent.

Naming: drop "node builder". Say **inspector** for level 2 and **node registry** for level 3. The old term covers scopes from a few hours (inspector) to weeks (a GUI for authoring kinds), so an agent told to "build the node builder" can pick the wrong one.

## Vocabulary

| Term | Meaning | In the code today |
|---|---|---|
| Flow | The document: node instances plus edges | zustand store `flow-builder-state` in `lib/store.ts`, persisted to localStorage, no `version` or `migrate` |
| Node kind | A category of node: image, video, tts, composition, cluster | `NodeKind` union in `lib/types.ts` |
| Node instance | One placed node: id, position, kind, param values, status, output | `FlowNode` and its `data` object |
| Port | A typed connection point (text, image, video, audio). React Flow calls it a handle | `TypedHandle`; id grammar `{nodeId}:{type}[:{port}]` in `lib/handles.ts` on `concept-cluster` |
| Param | A value the person sets on an instance: prompt, model, duration, voice | fields of `ImageNodeData`, `VideoNodeData` and the rest |
| Palette | Where kinds are picked from | `components/node-toolbar.tsx`, bottom bar, flat list |
| Inspector | Panel that edits the selected instance's params | missing; params are inline on the card |
| Node registry | One definition object per kind; everything else derives from it | missing |

## The three levels

| Level | Unit | Author | Surface | Changes |
|---|---|---|---|---|
| Flow | graph | person composing a flow | canvas and palette | every session |
| Node | instance params | same person | inspector or card | every session |
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
- Registering a kind touches 5 files with no single source of truth (commit `8958610`): `lib/types.ts`, `lib/store.ts` (`defaultData`), `components/node-toolbar.tsx`, `components/flow-canvas.tsx` (`nodeTypes`) and the node component. `lib/executor.ts` gets an `if (node.type === ...)` branch once the kind runs.
- Ports are declared only in JSX inside each node component. Build 11's spec (`Runaway/builds/11-clip-to-graph/spec.md`) already plans a second copy, `NODE_HANDLES`, because its graph validator and its LLM prompt both need ports as data.
- The pattern exists once already. `lib/models.ts` on `runway-node` holds `VIDEO_MODELS`, and its comment reads "Add a model here and both the UI and the dispatcher pick it up." The node registry is the same move one level up.

## The contract: one definition per kind

Draft sketch. The final shape is decision 4.

```ts
// lib/node-registry.ts (proposed)
export const imageNode = defineNode({
  kind: "image",
  label: "Image",
  group: "Generate",                        // palette section
  icon: ImageIcon,
  inputs: [{ type: "text" }, { type: "image" }],
  outputs: [{ type: "image" }],
  params: z.object({                        // defaults, validation, inspector form
    prompt: z.string().default(""),
    model: z.enum(["flux-dev", "flux-schnell", "nano-banana"]).default("flux-dev"),
  }),
  run: ({ params, inputs }) => post("/api/generate/image", { params, inputs }),
  Card: ImageCard,                          // optional custom body: media preview, prompt
});
```

Derived from the registry once it exists: the `NodeKind` and `FlowNode` unions, `defaultData`, `nodeTypes`, a grouped palette, the inspector form, the executor dispatch, build 11's `NODE_HANDLES`, and a JSON Schema of every kind for an agent or MCP client (idea 3 in `Runaway/builds/ranking.md`).

Two constraints from the existing code:

- The cluster node adds one output port per pinned concept at runtime, so `outputs` has to accept a function of the instance data.
- The persisted store has no `version`. Any change to the shape of instance `data` needs a persist `version` and `migrate` first, or saved graphs break.

Related work: a coded Flow Kit sits on branch `wave-2-flow-foundation` of `weeeha/Super-AI-Components` (local checkout `~/ClaudeCode Projects/AI Components`, path `apps/docs/registry/super-ai/flow/`): ai-node, typed-handle, typed-edge, port-chip, connection-hint, node-prompt, media-slot, model-bar, run-button, node-status, use-flow-runner, each with a test file. It supplies parts for a node card, which makes it the UI half of the kind level. The registry is the data half.

## Open decisions (reply by number and letter, for example "1B 2C 3A")

1. **What "node builder" means for the next build.**
   A. Inspector panel for the selected node (screenshot 2).
   B. Node registry in code (level 3).
   C. A GUI where a person authors new kinds.
   Recommended: B, then A. With the registry in place the inspector is one generic form. C is a separate product and OpenAI does not ship one either, so park it.
2. **Where params live.**
   A. All inline on the card (today).
   B. All in a right-hand inspector with compact cards (the reference).
   C. Hybrid: the card keeps preview, prompt and Run; the inspector holds model, duration, voice and advanced settings.
   Recommended: C. A media node has to show its output on the canvas. The reference has no media output to show.
3. **Node vocabulary.**
   A. Media only: image, video, tts, composition, cluster, reference.
   B. Add agent and logic kinds from the reference (Agent, Classify, If/else, While, Transform).
   Recommended: A. If/else and While need a control-flow executor. Today's runner sorts a DAG topologically and stops at the first error.
4. **Proposed [HAND] task.** Nick writes the `NodeDefinition` type himself, about 10 lines: which fields are required, whether `run` lives on the client or names a route, and how dynamic ports are expressed.

## Out of scope for now

- A GUI for authoring kinds (1C).
- Control flow nodes (3B).
- Multiplayer and saved templates.
