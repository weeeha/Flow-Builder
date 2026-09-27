"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FlowCanvas } from "@/components/flow-canvas";
import { installDebugHook } from "@/lib/flows/debug-hook";
import { getFlow } from "@/lib/flows/repo";
import { useFlowStore } from "@/lib/store";

/** Loads one flow into the store, then shows the canvas. */
export function OpenFlow({ id }: { id: string }) {
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => installDebugHook(), []);
  useEffect(() => {
    let live = true;
    getFlow(id).then((file) => {
      if (!live) return;
      if (!file) return setState("missing");
      useFlowStore.getState().openFlow(file);
      setState("ready");
    });
    return () => { live = false; };
  }, [id]);

  if (state === "missing") {
    return (
      <main className="grid h-dvh place-items-center text-center">
        <div>
          <p className="text-[15px] font-semibold">This flow doesn&apos;t exist</p>
          <Link href="/" className="mt-2 inline-block text-[13px] text-text-secondary underline">Back to flows</Link>
        </div>
      </main>
    );
  }
  return <main className="h-dvh w-screen">{state === "ready" && <FlowCanvas />}</main>;
}
