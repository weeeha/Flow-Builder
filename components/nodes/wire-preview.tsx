"use client";

import { gatherInputs } from "@/lib/executor";
import { useFlowStore } from "@/lib/store";

/** One-line preview of the text wired into a node. Renders nothing when no text is wired. */
export function WirePreview({ id }: { id: string }) {
  // The selector returns a string, so the node re-renders only when the wired text changes.
  const wired = useFlowStore((s) => gatherInputs(id, s.nodes, s.edges).texts.join(" "));
  if (!wired) return null;

  return (
    <p className="mb-2 truncate text-[11px] text-neutral-500" title={wired}>
      <span className="text-neutral-400">prompt from wire</span> {wired}
    </p>
  );
}
