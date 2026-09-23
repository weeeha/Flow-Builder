import { NODE_KINDS, type FieldSpec } from "./node-kinds";
import type { FlowNode, NodeKind } from "./types";

/**
 * What the inspector panel needs, derived from the kind table. Pure, so the
 * panel holds layout and nothing else.
 */

export interface InspectorField {
  /** The data key this field edits, e.g. "model". */
  key: string;
  spec: FieldSpec;
}

/** A kind's inspector fields, in the order the table lists them. */
export function inspectorFields(kind: NodeKind): InspectorField[] {
  const fields = NODE_KINDS[kind].fields as Record<string, FieldSpec | undefined>;
  return Object.entries(fields)
    .filter(([, spec]) => spec?.placement === "inspector")
    .map(([key, spec]) => ({ key, spec: spec as FieldSpec }));
}

/**
 * The value to write for a control that reported `raw`. A select hands back the
 * option's own value, so `duration` stays the number 6 rather than the string
 * "6"; a value the field does not offer writes nothing.
 */
export function fieldValue(spec: FieldSpec, raw: string): string | number | undefined {
  if (spec.control !== "select") return raw;
  return spec.options.find((option) => String(option.value) === raw)?.value;
}

/**
 * Which node the inspector is looking at: the one selected node, or none. With
 * nothing or several selected the panel closes, like the reference; Nick chose
 * this over Figma's stay-on-the-last-node on 2026-09-23.
 */
export function inspectorTarget(nodes: FlowNode[]): FlowNode | null {
  const selected = nodes.filter((node) => node.selected);
  return selected.length === 1 ? selected[0] : null;
}
