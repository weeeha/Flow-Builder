"use client";

import { useState } from "react";
import { NODE_VIEWS } from "@/components/nodes/registry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fieldValue, inspectorFields, inspectorTarget, type InspectorField } from "@/lib/inspector";
import { NODE_KINDS } from "@/lib/node-kinds";
import { useFlowStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { FlowNode } from "@/lib/types";

const WIDTH = 340;

/**
 * Settings for the one selected node. Deliberately not a Radix Dialog or Sheet:
 * both are modal, and the canvas has to stay live while this is open. A plain
 * positioned aside means no overlay, no focus trap, and tab order that reaches
 * the panel after the canvas.
 *
 * Which fields appear is the kind table's call, not this component's: it renders
 * every field whose placement is "inspector", in table order.
 */
export function Inspector() {
  const nodes = useFlowStore((s) => s.nodes);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const target = inspectorTarget(nodes);

  if (!target) return null;

  const kind = NODE_KINDS[target.type];
  const fields = inspectorFields(target.type);
  const main = fields.filter((field) => field.spec.group !== "advanced");
  const advanced = fields.filter((field) => field.spec.group === "advanced");
  const Icon = NODE_VIEWS[target.type].icon;

  return (
    <aside
      aria-label={`${kind.label} settings`}
      className="absolute right-4 top-4 z-10 flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-lg"
      style={{ width: WIDTH }}
    >
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-neutral-500" aria-hidden />
        <h2 className="text-[13px] font-medium text-neutral-900">{kind.label}</h2>
      </div>

      {fields.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-neutral-500">
          Nothing to configure on this node yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {main.map((field) => (
            <Field key={field.key} node={target} field={field} onChange={updateNodeData} />
          ))}

          {advanced.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowAdvanced((open) => !open)}
                aria-expanded={showAdvanced}
                className="self-start rounded text-[11px] font-medium text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {showAdvanced ? "Less" : "More"}
              </button>
              {showAdvanced &&
                advanced.map((field) => (
                  <Field key={field.key} node={target} field={field} onChange={updateNodeData} />
                ))}
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Field({
  node,
  field,
  onChange,
}: {
  node: FlowNode;
  field: InspectorField;
  onChange: (id: string, data: Partial<FlowNode["data"]>) => void;
}) {
  const spec = field.spec;
  const labelId = `${node.id}-${field.key}-label`;
  const current = (node.data as Record<string, unknown>)[field.key];

  const write = (raw: string) => {
    const value = fieldValue(spec, raw);
    if (value !== undefined) onChange(node.id, { [field.key]: value });
  };

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className="text-[11px] font-medium text-neutral-600">
        {spec.label}
      </span>

      {spec.control === "select" ? (
        <Select value={String(current ?? "")} onValueChange={write}>
          <SelectTrigger size="sm" aria-labelledby={labelId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.options.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
                {option.note && (
                  <span className="text-neutral-400">&middot; {option.note}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <textarea
          value={String(current ?? "")}
          onChange={(event) => write(event.target.value)}
          placeholder={spec.placeholder}
          rows={3}
          aria-labelledby={labelId}
          className={cn(
            "w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-[12px] outline-none",
            "focus:border-blue-400"
          )}
        />
      )}
    </div>
  );
}
