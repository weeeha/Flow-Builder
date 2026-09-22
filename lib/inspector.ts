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
 * Which node the inspector is looking at.
 *
 * [HAND] Nick's, per CONCEPT.md. Exactly one node selected is settled: show it.
 * The rest is his call, and `lastId` (the last single selection) is here so
 * either answer is reachable:
 *   - nothing selected: close like the reference, or stay on the last node like Figma?
 *   - several selected: close, or show what they have in common?
 *   - right after a deselect: does it differ from never having had a selection?
 * Returning null for both keeps today's behaviour, which is to close.
 */
export function inspectorTarget(nodes: FlowNode[], lastId: string | null): FlowNode | null {
  const selected = nodes.filter((node) => node.selected);
  if (selected.length === 1) return selected[0];
  void lastId; // TODO(HAND)
  return null;
}
