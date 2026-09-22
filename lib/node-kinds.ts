import { VIDEO_MODELS } from "./models";
import type { FlowNode, HandleType, NodeKind } from "./types";

/**
 * What a node kind is, as data: label, ports, params and starting values.
 * Everything that can be derived from a kind derives from here, so adding a kind
 * is one entry rather than an edit in five files. `lib/types.ts` stays the source
 * of truth for the data shapes themselves; this table adds metadata on top.
 *
 * Pure data on purpose: API routes and tests need ports without pulling in React.
 * Runners live in lib/runners.ts and cards in components/nodes/registry.tsx.
 */

export type DataOf<K extends NodeKind> = Extract<FlowNode, { type: K }>["data"];

/**
 * The keys an interface actually declares. `BaseNodeData extends
 * Record<string, unknown>`, so a plain `keyof` collapses to `string | number`
 * and would let any typo through.
 */
type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K];
};

/** A kind's starting data, minus the two fields the store owns. */
export type InitialData<K extends NodeKind> = Omit<
  Pick<DataOf<K>, KnownKeys<DataOf<K>>>,
  "status" | "error"
>;

export interface PortSpec {
  type: HandleType;
  /** Names a handle when a kind has several of one type; becomes the handle id's third segment. */
  port?: string;
  label?: string;
  /** Overrides the stacking rule in `portTop`. */
  top?: number;
}

export type FieldSpec = {
  label: string;
  /** The card keeps what you look at; the inspector holds the settings. */
  placement: "card" | "inspector";
  /** Inspector fields in this group sit behind the More toggle. */
  group?: "advanced";
} & (
  | { control: "textarea"; placeholder?: string }
  | {
      control: "select";
      options: readonly { value: string | number; label: string; note?: string }[];
    }
);

export interface KindSpec<K extends NodeKind> {
  label: string;
  group: "generate" | "ideate" | "assemble";
  /** False keeps a kind the app creates for itself off the toolbar. Defaults to true. */
  palette?: boolean;
  inputs: readonly PortSpec[];
  /** A function when the ports depend on instance data, as the cluster's pins do. */
  outputs: readonly PortSpec[] | ((data: DataOf<K>) => readonly PortSpec[]);
  fields: Partial<Record<KnownKeys<DataOf<K>>, FieldSpec>>;
  initial: InitialData<K>;
}

const IMAGE_MODELS = [
  { value: "flux-dev", label: "FLUX dev" },
  { value: "flux-schnell", label: "FLUX schnell", note: "Fastest, lower detail" },
  { value: "nano-banana", label: "Nano Banana" },
] as const;

const TTS_MODELS = [
  { value: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
  { value: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5", note: "Faster, lower fidelity" },
] as const;

const VOICES = ["Rachel", "Adam", "Alice", "Bella", "Charlie", "Domi"] as const;

/**
 * Keyed by kind and closed with `satisfies`, so the compiler reports a kind that
 * lacks an entry and a field key that no longer exists on the data type.
 */
export const NODE_KINDS = {
  image: {
    label: "Image",
    group: "generate",
    inputs: [{ type: "text" }, { type: "image" }],
    outputs: [{ type: "image" }],
    fields: {
      prompt: {
        label: "Prompt",
        placement: "card",
        control: "textarea",
        placeholder: "Describe the image...",
      },
      model: {
        label: "Model",
        placement: "inspector",
        control: "select",
        options: IMAGE_MODELS,
      },
    },
    initial: { prompt: "", model: "flux-dev" },
  },

  video: {
    label: "Video",
    group: "generate",
    inputs: [{ type: "text" }, { type: "image" }],
    outputs: [{ type: "video" }],
    fields: {
      prompt: {
        label: "Prompt",
        placement: "card",
        control: "textarea",
        placeholder: "Describe the video...",
      },
      model: {
        label: "Model",
        placement: "inspector",
        control: "select",
        options: VIDEO_MODELS.map((m) => ({ value: m.id, label: m.label, note: m.note })),
      },
      duration: {
        label: "Duration",
        placement: "inspector",
        control: "select",
        options: [
          { value: 4, label: "4s" },
          { value: 6, label: "6s" },
          { value: 8, label: "8s" },
        ],
      },
    },
    initial: { prompt: "", model: "seedance-2.0", duration: 4 },
  },

  tts: {
    label: "Text to Speech",
    group: "generate",
    inputs: [{ type: "text" }],
    outputs: [{ type: "audio" }],
    fields: {
      prompt: {
        label: "Text to speak",
        placement: "card",
        control: "textarea",
        placeholder: "Type the text to speak...",
      },
      voice: {
        label: "Voice",
        placement: "inspector",
        control: "select",
        options: VOICES.map((v) => ({ value: v, label: v })),
      },
      model: {
        label: "Model",
        placement: "inspector",
        control: "select",
        options: TTS_MODELS,
      },
    },
    initial: { prompt: "", voice: "Rachel", model: "eleven_multilingual_v2" },
  },

  composition: {
    label: "Composition",
    group: "assemble",
    inputs: [{ type: "video" }, { type: "audio" }],
    outputs: [],
    fields: {},
    initial: {},
  },

  cluster: {
    label: "Concept Cluster",
    group: "ideate",
    // Its lone input sits where a stacked one would, not centred, because the
    // groups below make the card tall.
    inputs: [{ type: "text", top: 24 }],
    // One text port per pin. The card renders these itself, beside each chip.
    outputs: (data) =>
      data.pinned.map((pin) => ({ type: "text" as const, port: pin.id, label: pin.text })),
    fields: {
      prompt: {
        label: "Seed prompt",
        placement: "card",
        control: "textarea",
        placeholder: "A loose prompt, e.g. a lighthouse at dusk",
      },
    },
    initial: { prompt: "", groups: [], pinned: [], outputTexts: {} },
  },
} satisfies { [K in NodeKind]: KindSpec<K> };

export const NODE_KIND_LIST = Object.keys(NODE_KINDS) as NodeKind[];

/**
 * A kind belongs in the toolbar unless it opts out. One that opts out is created
 * by the app instead, the way a dropped clip will create a reference node.
 */
export function inPalette(spec: { label: string; palette?: boolean }): boolean {
  return spec.palette !== false;
}

/** The kinds the toolbar offers, in order. */
export const PALETTE_KINDS = NODE_KIND_LIST.filter((kind) => inPalette(NODE_KINDS[kind]));

/** A fresh data object for a new node. Deep-copied, so two nodes never share an array. */
export function initialData<K extends NodeKind>(kind: K): DataOf<K> {
  return { ...structuredClone(NODE_KINDS[kind].initial), status: "idle" } as DataOf<K>;
}

/** A kind's output ports for one instance, resolving the function form. */
export function outputsOf<K extends NodeKind>(kind: K, data: DataOf<K>): readonly PortSpec[] {
  // TypeScript cannot correlate `kind` with `data` through a record lookup.
  const outputs = NODE_KINDS[kind].outputs as
    | readonly PortSpec[]
    | ((data: DataOf<K>) => readonly PortSpec[]);
  return typeof outputs === "function" ? outputs(data) : outputs;
}

/**
 * How far below the card's top edge a handle sits. One port on a side is
 * centred, which React Flow does when no offset is given; several stack.
 */
export function portTop(ports: readonly PortSpec[], index: number): number | undefined {
  const spec = ports[index];
  if (spec?.top !== undefined) return spec.top;
  return ports.length > 1 ? 24 + 32 * index : undefined;
}
