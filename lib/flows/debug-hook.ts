"use client";

import { clear } from "idb-keyval";
import { useFlowStore } from "../store";
import { migrate } from "./format";
import { kv, saveFlow } from "./repo";

/**
 * A small read-and-seed surface for the check scripts, installed in every build:
 * it reads the open flow and adds flows the same way import does, and touches
 * nothing else. The scripts read run state here now that it is no longer saved.
 */
export function installDebugHook() {
  (window as unknown as { __flowBuilder: unknown }).__flowBuilder = {
    state: () => {
      const { flowId, name, nodes, edges } = useFlowStore.getState();
      return { flowId, name, nodes, edges };
    },
    importFlow: async (raw: unknown) => (await saveFlow(migrate(raw))).id,
    reset: async () => {
      await clear(kv);
      localStorage.clear();
    },
  };
}
