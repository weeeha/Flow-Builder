# Flow Builder

Node-based visual flow builder for AI media pipelines — built with **Next.js 16**, **React Flow**, and **Zustand**.

Inspired by Higgsfield Flows / ComfyUI: drag nodes for image / video / TTS / composition onto a canvas, wire them together with typed handles, and run the graph end-to-end.

## Stack

- Next.js 16 (App Router) + React 19 + Turbopack
- [React Flow](https://reactflow.dev) (`@xyflow/react`) — MIT
- Zustand for state
- Tailwind CSS v4
- Vercel AI SDK for provider routing
- Vercel Blob for media storage
- fal.ai for image/video, ElevenLabs for TTS

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # optional — works in stub mode without keys
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The toolbar at the bottom adds nodes; drag from a node's right handle to another node's matching-coloured left handle. Hit **Run** on any node, or **Run all** to execute the whole graph in topological order.

## Handle colours

| Type | Colour |
|---|---|
| `text` | grey |
| `image` | blue |
| `video` | purple |
| `audio` | pink |

Connections are only allowed between handles of the **same** type.

## Stub mode

If you don't set `FAL_KEY` / `ELEVENLABS_API_KEY`, the API routes return placeholder media URLs so you can exercise the full UI without provisioning anything. Add the keys to `.env.local` to enable real generation.

## File map

```
app/page.tsx                            entry
app/api/generate/{image,video,speech}/  provider routes
components/flow-canvas.tsx              <ReactFlow/> wrapper
components/node-toolbar.tsx             bottom palette
components/nodes/                       custom node components
components/handles/typed-handle.tsx     coloured + validated handles
lib/store.ts                            Zustand + persist (localStorage)
lib/executor.ts                         topological runner
lib/types.ts                            shared types
```

## Deploying

```bash
vercel link
vercel env add FAL_KEY
vercel env add ELEVENLABS_API_KEY
vercel env add BLOB_READ_WRITE_TOKEN
vercel deploy
```

## Other libraries we considered

| Library | Why not picked |
|---|---|
| LiteGraph.js | Vanilla JS, less polished UI — viable for a ComfyUI-style fork |
| Rete.js | Stronger execution model but UI primitives less polished |
| Drawflow | Too minimal for this feature set |
| maxGraph | Heavy, more for BPMN/diagram apps |
